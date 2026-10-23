import assert from "node:assert/strict";
import test from "node:test";

import { importErrorWhere, checkImport, decodeCsvBytes, fileHash, IMPORT_HEADERS, importErrorMessage, parseCsv, templateCsv } from "./import.ts";

const head = IMPORT_HEADERS.join(",");

test("the template is a byte order mark, the header row and a line break", () => {
  const t = templateCsv();
  assert.equal(t.charCodeAt(0), 0xfeff);
  assert.equal(t.slice(1), head + "\r\n");
  assert.equal(checkImport(parseCsv(t)).problems[0].message, "取り込めるデータがありません。");
});

test("csv: quotes, commas, line breaks inside quotes, CRLF and LF", () => {
  const rows = parseCsv('a,"b,1","c ""q"""\r\n1,"x\ny",\n');
  assert.deepEqual(rows, [["a", "b,1", 'c "q"'], ["1", "x\ny", ""]]);
  assert.deepEqual(parseCsv("﻿a,b"), [["a", "b"]]);
  assert.deepEqual(parseCsv(""), []);
});

test("good rows are read", () => {
  const c = checkImport(parseCsv(`${head}\r\n参加者,4,3,4,4,3,わかりやすい,山田\r\n依頼企業,2,2,3,3,2,,\r\n`));
  assert.equal(c.total, 2);
  assert.equal(c.problems.length, 0);
  assert.deepEqual(c.rows[0], { role: "PARTICIPANT", q1: 4, q2: 3, q3: 4, q4: 4, q5: 3, comment: "わかりやすい", name: "山田" });
  assert.deepEqual(c.rows[1], { role: "HIRER", q1: 2, q2: 2, q3: 3, q4: 3, q5: 2, comment: null, name: null });
});

test("full-width digits and spaces are accepted", () => {
  const c = checkImport(parseCsv(`${head}\n　参加者 ,４,３,４,４,３,,\n`));
  assert.equal(c.problems.length, 0);
  assert.equal(c.rows[0].q1, 4);
});

test("blank lines are skipped and line numbers count from the header", () => {
  const c = checkImport(parseCsv(`${head}\n参加者,4,3,4,4,3,,\n,,,,,,,\n参加者,4,3,4,4,5,,\n`));
  assert.equal(c.total, 2);
  assert.equal(c.badLines, 1);
  assert.deepEqual(c.problems, [{ line: 4, message: "設問5は1〜4の数字で入力してください。" }]);
  assert.equal(c.rows.length, 1);
});

test("each kind of problem is named", () => {
  const long = "あ".repeat(1001);
  const c = checkImport(parseCsv(`${head}\n先生,4,3,4,4,3,,\n参加者,0,3,4,4,3,,\n参加者,4,3.5,4,4,3,,\n参加者,4,3,4,4,,,\n参加者,4,3,4,4,3,${long},\n参加者,4,3,4,4,3,,${"あ".repeat(41)}\n`));
  const text = c.problems.map((p) => `${p.line}:${p.message}`);
  assert.deepEqual(text, [
    "2:回答者区分は「参加者」か「依頼企業」にしてください。",
    "3:設問1は1〜4の数字で入力してください。",
    "4:設問2は1〜4の数字で入力してください。",
    "5:設問5は1〜4の数字で入力してください。",
    "6:コメントは1000文字までです。",
    "7:名前は40文字までです。",
  ]);
  assert.equal(c.badLines, 6);
  assert.equal(c.rows.length, 0);
});

test("several problems in one line are all listed but the line counts once", () => {
  const c = checkImport(parseCsv(`${head}\nx,9,9,4,4,3,,\n`));
  assert.equal(c.problems.length, 3);
  assert.equal(c.badLines, 1);
});

test("a missing column is reported for the whole file", () => {
  const c = checkImport(parseCsv("回答者区分,設問1,設問2\n参加者,1,2\n"));
  assert.equal(c.problems.length, 1);
  assert.equal(c.problems[0].line, 1);
  assert.match(c.problems[0].message, /設問3.*設問4.*設問5/);
});

test("short question headers and extra columns are fine; columns may be in another order", () => {
  const c = checkImport(parseCsv("名前,メモ,設問3,設問1,設問2,設問5,設問4,回答者区分,コメント\n山,x,3,1,2,4,3,参加者,ok\n"));
  assert.equal(c.problems.length, 0);
  assert.deepEqual(c.rows[0], { role: "PARTICIPANT", q1: 1, q2: 2, q3: 3, q4: 3, q5: 4, comment: "ok", name: "山" });
});

test("empty file, no data and too many rows", () => {
  assert.equal(checkImport([]).problems[0].message, "ファイルが空です。");
  const many = Array.from({ length: 501 }, () => "参加者,4,3,4,4,3,,").join("\n");
  const c = checkImport(parseCsv(`${head}\n${many}\n`));
  assert.equal(c.total, 501);
  assert.match(c.problems[0].message, /500行/);
  const ok = Array.from({ length: 500 }, () => "参加者,4,3,4,4,3,,").join("\n");
  assert.equal(checkImport(parseCsv(`${head}\n${ok}\n`)).rows.length, 500);
});

test("utf-8 and shift_jis bytes are both read", () => {
  const utf8 = new TextEncoder().encode("参加者,依頼企業");
  assert.equal(decodeCsvBytes(utf8), "参加者,依頼企業");
  // 参加者 in Shift_JIS
  const sjis = new Uint8Array([0x8e, 0x51, 0x89, 0xc1, 0x8e, 0xd2]);
  assert.equal(decodeCsvBytes(sjis), "参加者");
});

test("the same bytes give the same fingerprint", async () => {
  const a = await fileHash(new TextEncoder().encode("abc"));
  assert.equal(a, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(a, await fileHash(new TextEncoder().encode("abd")));
});

test("database errors become short messages", () => {
  assert.equal(importErrorMessage("duplicate_file"), "このファイルは取り込み済みです。");
  assert.equal(importErrorMessage("not_open"), "研修の初日以降に取り込めます。");
  assert.match(importErrorMessage("something else"), /取り込めませんでした/);
});

test("a database row error says which line and which column", () => {
  assert.equal(importErrorWhere("row=2 field=q3"), "3行目の設問3");
  assert.match(importErrorMessage("bad_row", "row=1 field=role"), /^2行目の回答者区分に問題があります/);
  assert.match(importErrorMessage("bad_row"), /ファイルの内容に問題/);
});

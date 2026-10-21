import assert from "node:assert/strict";
import test from "node:test";

import { checkImport, IMPORT_HEADERS } from "./import.ts";
import { buildXlsx, looksLikeXlsx, readXlsx, templateXlsx } from "./xlsx.ts";

const head = [...IMPORT_HEADERS] as string[];

test("the template workbook is a zip and its answer sheet is just the header", async () => {
  const bytes = templateXlsx();
  assert.equal(looksLikeXlsx(bytes), true);
  const rows = await readXlsx(bytes);
  assert.deepEqual(rows, [head]);
  assert.equal(checkImport(rows).problems[0].message, "取り込めるデータがありません。");
});

test("a filled sheet is read and checked like a CSV", async () => {
  const bytes = buildXlsx([
    { name: "説明", rows: [["これは読まれません"]] },
    {
      name: "回答",
      rows: [head, ["参加者", "4", "3", "4", "4", "3", "わかりやすい & 楽しい <3", "山田"], [], ["依頼企業", "2", "2", "3", "3", "2", "", ""]],
    },
  ]);
  const rows = await readXlsx(bytes);
  assert.equal(rows.length, 4);
  assert.equal(rows[1][6], "わかりやすい & 楽しい <3");
  const c = checkImport(rows);
  assert.equal(c.total, 2);
  assert.equal(c.problems.length, 0);
  assert.equal(c.rows[0].name, "山田");
});

test("line numbers keep the empty rows, so messages match Excel", async () => {
  const bytes = buildXlsx([{ name: "回答", rows: [head, [], ["参加者", "4", "3", "4", "4", "9", "", ""]] }]);
  const c = checkImport(await readXlsx(bytes));
  assert.equal(c.problems[0].line, 3);
  assert.equal(c.problems[0].message, "設問5は1〜4の数字で入力してください。");
});

test("the first sheet is used when there is no sheet named 回答", async () => {
  const bytes = buildXlsx([{ name: "Sheet1", rows: [head, ["参加者", "1", "2", "3", "4", "1", "", ""]] }]);
  assert.equal(checkImport(await readXlsx(bytes)).rows.length, 1);
});

test("a file that is not an xlsx is refused", async () => {
  await assert.rejects(() => readXlsx(new TextEncoder().encode("a,b,c\n1,2,3\n")), /not_zip/);
  assert.equal(looksLikeXlsx(new TextEncoder().encode("a,b")), false);
});

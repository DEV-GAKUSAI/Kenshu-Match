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

/* ---- files written by other programs (sheet #38, 10/23 note) ---- */

import { deflateRawSync } from "node:zlib";

/** A zip written like Excel does: files compressed with deflate. */
function zipFiles(files: Record<string, string>, compress: boolean): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(enc.encode(text));
    const data = compress ? deflateRawSync(raw) : raw;
    const nm = Buffer.from(enc.encode(name));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(compress ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nm.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(compress ? 8 : 0, 10);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nm.length, 28);
    cen.writeUInt32LE(offset, 42);
    chunks.push(local, nm, data);
    central.push(Buffer.concat([cen, nm]));
    offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, cd, end]));
}

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** The same workbook, with the spreadsheet tags written with a prefix (p = "x") or without (p = ""). */
function workbookFiles(p: string): Record<string, string> {
  const t = (n: string) => (p ? `${p}:${n}` : n);
  const xmlns = p ? `xmlns:${p}="${NS}"` : `xmlns="${NS}"`;
  const strings = ["回答者区分", "設問1（教材）", "設問2（理解）", "設問3（難易度）", "設問4（教え方）", "設問5（時間の長さ）", "コメント", "名前", "参加者", "依頼企業", "良かった & 分かりやすい"];
  const sst =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${t("sst")} ${xmlns} count="11" uniqueCount="11">` +
    strings
      .map((s, i) => (i === 8 ? `<${t("si")}><${t("t")}>参加者</${t("t")}><${t("rPh")} sb="0" eb="3"><${t("t")}>サンカシャ</${t("t")}></${t("rPh")}></${t("si")}>` : `<${t("si")}><${t("t")}>${s.replace("&", "&amp;")}</${t("t")}></${t("si")}>`))
      .join("") +
    `</${t("sst")}>`;
  const c = (ref: string, v: number, type?: string) => `<${t("c")} r="${ref}"${type ? ` t="${type}"` : ""}><${t("v")}>${v}</${t("v")}></${t("c")}>`;
  const row = (n: number, cells: string) => `<${t("row")} r="${n}" spans="1:8">${cells}</${t("row")}>`;
  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${t("worksheet")} ${xmlns}><${t("sheetData")}>` +
    row(1, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => c(`${"ABCDEFGH"[i]}1`, i, "s")).join("")) +
    row(2, c("A2", 8, "s") + [4, 3, 4, 4, 3].map((v, i) => c(`${"BCDEF"[i]}2`, v)).join("") + c("G2", 10, "s") + c("H2", 7, "s")) +
    row(3, c("A3", 9, "s") + [2, 2, 3, 3, 2].map((v, i) => c(`${"BCDEF"[i]}3`, v)).join("")) +
    `</${t("sheetData")}></${t("worksheet")}>`;
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
    "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0"?><${t("workbook")} ${xmlns} xmlns:r="${REL}"><${t("sheets")}><${t("sheet")} name="回答" sheetId="1" r:id="rId1"/></${t("sheets")}></${t("workbook")}>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/sharedStrings.xml": sst,
    "xl/worksheets/sheet1.xml": sheet,
  };
}

for (const prefix of ["", "x", "ss"]) {
  for (const compress of [false, true]) {
    test(`an xlsx with tag prefix "${prefix}" ${compress ? "compressed" : "stored"} is read like the plain one`, async () => {
      const rows = await readXlsx(zipFiles(workbookFiles(prefix), compress));
      const c = checkImport(rows);
      assert.equal(c.problems.length, 0, JSON.stringify(c.problems));
      assert.equal(c.total, 2);
      assert.equal(c.rows[0].role, "PARTICIPANT"); // furigana (サンカシャ) is not part of the text
      assert.equal(c.rows[0].comment, "良かった & 分かりやすい");
      assert.equal(c.rows[0].name, "名前");
      assert.equal(c.rows[1].role, "HIRER");
    });
  }
}

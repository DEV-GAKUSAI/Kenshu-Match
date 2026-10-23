/**
 * 研修アンケート bulk import: Excel (.xlsx) files, without any extra library.
 * An .xlsx file is a zip of small XML files. This reads the first answer sheet
 * of such a file into rows of text (the same shape as the CSV reader gives),
 * and writes the template workbook. Only what the import needs is supported:
 * text and number cells, shared strings, no formulas or dates.
 */

import { IMPORT_HEADERS, IMPORT_MAX_ROWS } from "./import.ts";

const MAX_XLSX_BYTES = 5 * 1024 * 1024;
const MAX_PART_BYTES = 20 * 1024 * 1024;

/* ---------------------------------------------------------------- zip (read) */

type ZipEntry = { name: string; method: number; compSize: number; size: number; offset: number };

function u16(d: DataView, o: number) {
  return d.getUint16(o, true);
}
function u32(d: DataView, o: number) {
  return d.getUint32(o, true);
}

function listZip(bytes: Uint8Array): ZipEntry[] {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(d, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not_zip");
  const count = u16(d, eocd + 10);
  let p = u32(d, eocd + 16);
  const entries: ZipEntry[] = [];
  const utf8 = new TextDecoder("utf-8");
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || u32(d, p) !== 0x02014b50) throw new Error("not_zip");
    const nameLen = u16(d, p + 28);
    const extraLen = u16(d, p + 30);
    const commentLen = u16(d, p + 32);
    entries.push({
      method: u16(d, p + 10),
      compSize: u32(d, p + 20),
      size: u32(d, p + 24),
      offset: u32(d, p + 42),
      name: utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen)),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(bytes: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  if (e.size > MAX_PART_BYTES) throw new Error("too_big");
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (u32(d, e.offset) !== 0x04034b50) throw new Error("not_zip");
  const start = e.offset + 30 + u16(d, e.offset + 26) + u16(d, e.offset + 28);
  const data = bytes.subarray(start, start + e.compSize);
  if (e.method === 0) return data;
  if (e.method !== 8) throw new Error("not_zip");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ---------------------------------------------------------------- xml helpers */

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Takes the namespace prefix off every tag: <x:row> becomes <row>, </x:v> becomes </v>.
 * Some programs write the spreadsheet tags with a prefix (x:, ss:, main:) instead of the
 * default namespace; the readers below only know the plain names. Attributes (r:id) are untouched.
 */
function stripPrefixes(xml: string): string {
  return xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, "<$1");
}

/** All text inside <t>…</t> tags of a fragment, joined (rich text keeps its pieces in several <t>). Furigana (<rPh>) is left out. */
function textOf(fragment: string): string {
  let out = "";
  const plain = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  for (const m of plain.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)) out += decodeEntities(m[1] ?? "");
  return out;
}

/** Value of an attribute, with or without a namespace prefix (id and r:id are the same for us). */
function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${name}="([^"]*)"`).exec(attrs)?.[1];
}

/** Folder of a part name: "xl/workbook.xml" -> "xl". */
function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Resolves a relationship target against the folder of the part that owns it. */
function resolveTarget(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (baseDir ? baseDir.split("/") : []).concat(target.split("/"));
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part !== "." && part !== "") out.push(part);
  }
  return out.join("/");
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/[^A-Za-z]/g, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/* ---------------------------------------------------------------- xlsx (read) */

/**
 * Rows of text of the answer sheet: the sheet named 「回答」, otherwise the
 * first sheet. Row numbers are kept (empty rows stay empty) so line numbers
 * in messages match what the person sees in Excel.
 */
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  if (bytes.length > MAX_XLSX_BYTES) throw new Error("too_big");
  const entries = listZip(bytes);
  const find = (name: string) => entries.find((e) => e.name === name);
  const text = async (name: string) => {
    const e = find(name);
    return e ? new TextDecoder("utf-8").decode(await readEntry(bytes, e)) : null;
  };

  const xml = async (name: string) => {
    const raw = await text(name);
    return raw === null ? null : stripPrefixes(raw);
  };

  // where the workbook is: named in _rels/.rels, usually xl/workbook.xml
  let workbookPath = "xl/workbook.xml";
  const rootRels = (await xml("_rels/.rels")) ?? "";
  for (const m of rootRels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    if (/officeDocument$/.test(attr(m[1], "Type") ?? "")) workbookPath = resolveTarget("", attr(m[1], "Target") ?? workbookPath);
  }
  const workbook = await xml(workbookPath);
  if (!workbook) throw new Error("not_xlsx");
  const baseDir = dirOf(workbookPath);
  const relsName = `${baseDir ? baseDir + "/" : ""}_rels/${workbookPath.slice(baseDir ? baseDir.length + 1 : 0)}.rels`;
  const rels = (await xml(relsName)) ?? "";
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)].map((m) => ({
    name: decodeEntities(attr(m[1], "name") ?? ""),
    rid: attr(m[1], "id") ?? "",
  }));
  if (!sheets.length) throw new Error("not_xlsx");
  const chosen = sheets.find((s) => s.name === "回答") ?? sheets[0];
  let target = "";
  let sharedPath = `${baseDir ? baseDir + "/" : ""}sharedStrings.xml`;
  for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const t = attr(m[1], "Target") ?? "";
    if (attr(m[1], "Id") === chosen.rid) target = t;
    if (/sharedStrings$/.test(attr(m[1], "Type") ?? "")) sharedPath = resolveTarget(baseDir, t);
  }
  const path = target ? resolveTarget(baseDir, target) : `${baseDir ? baseDir + "/" : ""}worksheets/sheet1.xml`;
  const sheetXml = await xml(path);
  if (!sheetXml) throw new Error("not_xlsx");

  const sharedXml = await xml(sharedPath);
  const shared: string[] = [];
  if (sharedXml) for (const m of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g)) shared.push(textOf(m[1] ?? ""));

  const rows: string[][] = [];
  let nextRow = 0;
  for (const rm of sheetXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rn = /\br="(\d+)"/.exec(rm[1])?.[1];
    const rowIndex = rn ? Number(rn) - 1 : nextRow;
    nextRow = rowIndex + 1;
    if (rowIndex >= IMPORT_MAX_ROWS + 50) continue; // far beyond the limit; the row count check reports it
    const cells: string[] = [];
    let nextCol = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Za-z]+\d+)"/.exec(cm[1])?.[1];
      const col = ref ? columnIndex(ref) : nextCol;
      nextCol = col + 1;
      const type = /\bt="([^"]*)"/.exec(cm[1])?.[1] ?? "n";
      const inner = cm[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(inner);
      else if (type === "str" || type === "e") value = decodeEntities(v ?? "");
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else value = decodeEntities(v ?? "");
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = cells;
  }
  return rows;
}

/* --------------------------------------------------------------- zip (write) */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip with every file stored uncompressed (the template is tiny). */
function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const push = (arr: Uint8Array) => {
    chunks.push(arr);
    offset += arr.length;
  };
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const ld = new DataView(local.buffer);
    ld.setUint32(0, 0x04034b50, true);
    ld.setUint16(4, 20, true);
    ld.setUint16(6, 0x0800, true);
    ld.setUint16(10, 0, true);
    ld.setUint16(12, 0x21, true); // 1980-01-01
    ld.setUint32(14, crc, true);
    ld.setUint32(18, f.data.length, true);
    ld.setUint32(22, f.data.length, true);
    ld.setUint16(26, name.length, true);
    local.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const cd = new DataView(cen.buffer);
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);
    push(local);
    push(f.data);
  }
  const cdStart = offset;
  for (const c of central) push(c);
  const end = new Uint8Array(22);
  const ed = new DataView(end.buffer);
  ed.setUint32(0, 0x06054b50, true);
  ed.setUint16(8, files.length, true);
  ed.setUint16(10, files.length, true);
  ed.setUint32(12, offset - cdStart, true);
  ed.setUint32(16, cdStart, true);
  push(end);
  const out = new Uint8Array(offset);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/* ------------------------------------------------------------- xlsx (write) */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(rows: string[][], widths: number[]): string {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const body = rows
    .map(
      (cells, r) =>
        `<row r="${r + 1}">` +
        cells.map((v, c) => (v === "" ? "" : `<c r="${colName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`)).join("") +
        `</row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

/** An .xlsx file with the given sheets (all cells are text). Also used by the tests. */
export function buildXlsx(sheets: { name: string; rows: string[][]; widths?: number[] }[]): Uint8Array {
  const enc = new TextEncoder();
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const files = [
    {
      name: "[Content_Types].xml",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `</Types>`,
    },
    { name: "_rels/.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    {
      name: "xl/workbook.xml",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}"><sheets>` +
        sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        `</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `</Relationships>`,
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s.rows, s.widths ?? s.rows[0]?.map(() => 18) ?? []) })),
  ];
  return zip(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })));
}

/** The template workbook: sheet 「回答」 (header only, to be filled in) and sheet 「説明」 (how to fill it in, with an example). */
export function templateXlsx(): Uint8Array {
  const header = [...IMPORT_HEADERS] as string[];
  return buildXlsx([
    { name: "回答", rows: [header], widths: [14, 16, 16, 16, 16, 18, 40, 16] },
    {
      name: "説明",
      widths: [14, 16, 16, 16, 16, 18, 40, 16],
      rows: [
        ["使い方"],
        ["1. 「回答」シートの2行目から、回答した人1人につき1行で入力します。1行目の見出しは変えないでください。"],
        ["2. 回答者区分は「参加者」か「依頼企業」を入力します。"],
        ["3. 設問1〜5は1〜4の数字で入力します（4＝良い、3＝やや良い、2＝やや悪い、1＝悪い）。"],
        ["4. コメントと名前は空欄でも構いません。名前を入れると、参加者・依頼企業のどちらの行でも、その名前が回答者名として表示されます（空欄のときは「参加者」「依頼企業（匿名）」と表示）。"],
        [`5. 一度に取り込めるのは${IMPORT_MAX_ROWS}行までです。`],
        ["6. 保存したら、Kenshu Link の「アンケート結果を取り込む」からファイルを選びます。"],
        [""],
        ["入力例（「回答」シートには入れないでください）"],
        header,
        ["参加者", "4", "3", "4", "4", "3", "わかりやすかったです。", "山田"],
        ["依頼企業", "3", "3", "3", "4", "3", "", ""],
      ],
    },
  ]);
}

/** True when the bytes start like a zip file (an .xlsx is one). */
export function looksLikeXlsx(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

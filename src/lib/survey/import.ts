/**
 * 研修アンケート: bulk import of results collected outside Kenshu Link
 * (sheet #38). The file follows our fixed template: one row per person who
 * answered, our five questions on the four-step scale. Everything here is
 * plain code (no browser or server needed) so it can be tested. The same
 * checks run again inside the database function (migration 148).
 */

import { COMMENT_MAX, NAME_MAX } from "./answers.ts";

export const IMPORT_MAX_ROWS = 500;

/** Header row of the template, in order. The question columns are found by "設問N". */
export const IMPORT_HEADERS = ["回答者区分", "設問1（教材）", "設問2（理解）", "設問3（難易度）", "設問4（教え方）", "設問5（時間の長さ）", "コメント", "名前"] as const;

export const ROLE_LABELS = { 参加者: "PARTICIPANT", 依頼企業: "HIRER" } as const;

export type ImportRow = {
  role: "PARTICIPANT" | "HIRER";
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  q5: number;
  comment: string | null;
  name: string | null;
};

export type ImportProblem = {
  /** Line in the file (the header is line 1, so the first answer is line 2); 0 = the file itself. */
  line: number;
  message: string;
};

export type ImportCheck = {
  /** Number of answer rows found (blank lines are skipped). */
  total: number;
  rows: ImportRow[];
  problems: ImportProblem[];
  /** Lines that have at least one problem. */
  badLines: number;
};

/** The template as text: a byte order mark (so Excel reads it as UTF-8) and the header row. */
export function templateCsv(): string {
  return "﻿" + IMPORT_HEADERS.map(quote).join(",") + "\r\n";
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Reads CSV text into rows of cells. Handles quotes, commas and line breaks
 * inside quotes, and both CRLF and LF. A leading byte order mark is dropped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Bytes of a CSV file to text. Excel on Japanese Windows saves plain "CSV" as
 * Shift_JIS and "CSV UTF-8" as UTF-8; both are read.
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("shift_jis").decode(bytes);
    } catch {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim();
}

function findColumn(header: string[], match: (h: string) => boolean): number {
  return header.findIndex((h) => match(normalize(h)));
}

/** Checks the cells of a file (header row first) against the template. */
export function checkImport(cells: string[][]): ImportCheck {
  const empty = (problems: ImportProblem[]): ImportCheck => ({ total: 0, rows: [], problems, badLines: problems.length ? 1 : 0 });
  if (cells.length === 0) return empty([{ line: 0, message: "ファイルが空です。" }]);

  const header = cells[0];
  const roleCol = findColumn(header, (h) => h === "回答者区分");
  const qCols = [1, 2, 3, 4, 5].map((n) => findColumn(header, (h) => h.startsWith(`設問${n}`)));
  const commentCol = findColumn(header, (h) => h === "コメント");
  const nameCol = findColumn(header, (h) => h === "名前");
  const missing: string[] = [];
  if (roleCol < 0) missing.push("回答者区分");
  qCols.forEach((col, i) => {
    if (col < 0) missing.push(`設問${i + 1}`);
  });
  if (missing.length) {
    return empty([{ line: 1, message: `見出しの行に「${missing.join("」「")}」の列がありません。テンプレートをお使いください。` }]);
  }

  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  const bad = new Set<number>();
  let total = 0;
  const fail = (line: number, message: string) => {
    problems.push({ line, message });
    bad.add(line);
  };

  for (let i = 1; i < cells.length; i++) {
    const cellsOfRow = cells[i];
    if (cellsOfRow.every((c) => normalize(c) === "")) continue; // blank line
    total++;
    const line = i + 1;
    const before = problems.length;

    const roleText = normalize(cellsOfRow[roleCol] ?? "");
    const role = (ROLE_LABELS as Record<string, "PARTICIPANT" | "HIRER">)[roleText];
    if (!role) fail(line, "回答者区分は「参加者」か「依頼企業」にしてください。");

    const q: number[] = [];
    qCols.forEach((col, n) => {
      const text = normalize(cellsOfRow[col] ?? "");
      if (!/^[1-4]$/.test(text)) {
        fail(line, `設問${n + 1}は1〜4の数字で入力してください。`);
        q.push(0);
      } else {
        q.push(Number(text));
      }
    });

    const comment = commentCol >= 0 ? (cellsOfRow[commentCol] ?? "").trim() : "";
    if (comment.length > COMMENT_MAX) fail(line, `コメントは${COMMENT_MAX}文字までです。`);
    const name = nameCol >= 0 ? (cellsOfRow[nameCol] ?? "").trim() : "";
    if (name.length > NAME_MAX) fail(line, `名前は${NAME_MAX}文字までです。`);

    if (problems.length === before && role) {
      rows.push({ role, q1: q[0], q2: q[1], q3: q[2], q4: q[3], q5: q[4], comment: comment || null, name: name || null });
    }
  }

  if (total === 0) return empty([{ line: 0, message: "取り込めるデータがありません。" }]);
  if (total > IMPORT_MAX_ROWS) {
    return { total, rows: [], problems: [{ line: 0, message: `一度に取り込めるのは${IMPORT_MAX_ROWS}行までです。ファイルを分けてください。` }], badLines: 1 };
  }
  return { total, rows, problems, badLines: bad.size };
}

/** Fingerprint of the file's bytes (SHA-256, hex): the same file cannot be imported twice. */
export async function fileHash(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Turns a database error from the import functions into a message for the person importing. */
export function importErrorMessage(raw: string): string {
  if (raw.includes("duplicate_file")) return "このファイルは取り込み済みです。";
  if (raw.includes("not_open")) return "研修の初日以降に取り込めます。";
  if (raw.includes("request_not_accepted")) return "依頼が承諾されてから取り込めます。";
  if (raw.includes("instructor_not_found")) return "講師が決まってから取り込めます。";
  if (raw.includes("too_many_rows")) return `一度に取り込めるのは${IMPORT_MAX_ROWS}行までです。`;
  if (raw.includes("bad_row")) return "ファイルの内容に問題があります。もう一度確認してください。";
  if (raw.includes("past_training_not_found")) return "過去の研修が見つかりません。";
  if (raw.includes("admin_only")) return "管理者のみ操作できます。";
  if (raw.includes("batch_not_found")) return "取り込みが見つかりません。";
  return "取り込めませんでした。時間をおいてもう一度お試しください。";
}

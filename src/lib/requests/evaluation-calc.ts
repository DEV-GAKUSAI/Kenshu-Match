// 講師の評価 (#55): the company rates a decided lecturer after the training. Pure rules (no database here).

export const EVAL_ITEMS = [
  { key: "expertise", label: "専門性" },
  { key: "teaching", label: "教え方" },
  { key: "preparation", label: "準備" },
  { key: "communication", label: "連絡" },
  { key: "cooperation", label: "運営協力" },
] as const;

export type EvalKey = (typeof EVAL_ITEMS)[number]["key"];
export type Reuse = "yes" | "maybe" | "no";

export const REUSE_OPTIONS: { value: Reuse; label: string }[] = [
  { value: "yes", label: "ぜひ再依頼したい" },
  { value: "maybe", label: "機会があれば" },
  { value: "no", label: "再依頼しない" },
];

export const REUSE_TEXT: Record<Reuse, string> = { yes: "ぜひ再依頼したい", maybe: "機会があれば", no: "再依頼しない" };

export const EVAL_COMMENT_MAX = 1000;
export const EVAL_NAME_MAX = 40;

export type EvalInput = {
  expertise: number;
  teaching: number;
  preparation: number;
  communication: number;
  cooperation: number;
  reuse: Reuse | "";
  comment: string;
  evaluator_name: string;
};

export const EMPTY_EVAL: EvalInput = { expertise: 0, teaching: 0, preparation: 0, communication: 0, cooperation: 0, reuse: "", comment: "", evaluator_name: "" };

/** The message to show when the form cannot be saved yet; null when it is fine. */
export function evaluationError(v: EvalInput): string | null {
  for (const item of EVAL_ITEMS) {
    const n = v[item.key];
    if (!Number.isInteger(n) || n < 1 || n > 5) return `「${item.label}」の星を選んでください。`;
  }
  if (v.reuse !== "yes" && v.reuse !== "maybe" && v.reuse !== "no") return "「再依頼の意向」を選んでください。";
  const name = v.evaluator_name.trim();
  if (!name) return "評価した人の名前を入力してください。";
  if (name.length > EVAL_NAME_MAX) return `評価した人の名前は${EVAL_NAME_MAX}文字以内にしてください。`;
  if (v.comment.length > EVAL_COMMENT_MAX) return `コメントは${EVAL_COMMENT_MAX}文字以内にしてください。`;
  return null;
}

/** Average of the five star items, one decimal (4.2). */
export function averageScore(v: Pick<EvalInput, EvalKey>): number {
  const sum = EVAL_ITEMS.reduce((s, i) => s + v[i.key], 0);
  return Math.round((sum / EVAL_ITEMS.length) * 10) / 10;
}

export type EvalSummary = { count: number; avg: number; reuseYes: number; reuseNo: number };

/** Per lecturer: how many evaluations, the average of their averages (one decimal), and how many said ぜひ / しない. */
export function summarizeEvaluations(rows: (Pick<EvalInput, EvalKey> & { instructor_id: string; reuse: string })[]): Record<string, EvalSummary> {
  const sums: Record<string, { count: number; total: number; yes: number; no: number }> = {};
  for (const r of rows) {
    const s = (sums[r.instructor_id] ??= { count: 0, total: 0, yes: 0, no: 0 });
    s.count += 1;
    s.total += averageScore(r);
    if (r.reuse === "yes") s.yes += 1;
    if (r.reuse === "no") s.no += 1;
  }
  const out: Record<string, EvalSummary> = {};
  for (const [id, s] of Object.entries(sums)) out[id] = { count: s.count, avg: Math.round((s.total / s.count) * 10) / 10, reuseYes: s.yes, reuseNo: s.no };
  return out;
}

/** One line for the company's instructor book, e.g. 「依頼ごとの評価 ★3.8（2件）・ぜひ再依頼 1件」. */
export function evaluationSummaryText(s: EvalSummary | undefined): string | null {
  if (!s) return null;
  return `依頼ごとの評価 ★${s.avg.toFixed(1)}（${s.count}件）${s.reuseYes > 0 ? `・ぜひ再依頼 ${s.reuseYes}件` : ""}${s.reuseNo > 0 ? `・再依頼しない ${s.reuseNo}件` : ""}`;
}

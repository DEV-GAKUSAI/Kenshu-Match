/**
 * 研修アンケート: the five questions, the four-step scale, and the checks shared
 * by the participant form and its server route. Questions come from 高石さん
 * (via Maeda-san, 10/13). All five are required.
 */

export const SURVEY_QUESTIONS = [
  { key: "q1", text: "教材は分かりやすかったですか？" },
  { key: "q2", text: "講義・演習は理解できましたか？" },
  { key: "q3", text: "講義・演習の難易度は適切でしたか？" },
  { key: "q4", text: "講師の教え方は良かったですか？" },
  { key: "q5", text: "講義・演習時間の長さは適切でしたか？" },
] as const;

export type SurveyQuestionKey = (typeof SURVEY_QUESTIONS)[number]["key"];

export const SURVEY_SCALE = [
  { value: 4, label: "良い" },
  { value: 3, label: "やや良い" },
  { value: 2, label: "やや悪い" },
  { value: 1, label: "悪い" },
] as const;

export const COMMENT_MAX = 1000;
export const NAME_MAX = 40;

/** What a link can be in: matches the database function (migration 138). */
export type SurveyLinkState = "ok" | "invalid" | "used" | "not_open" | "closed";

const TOKEN_RE = /^[0-9a-f]{64}$/;
export function isSurveyToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export type SurveyScores = Record<SurveyQuestionKey, number>;

export type ParsedSubmission = {
  token: string;
  scores: SurveyScores;
  comment: string | null;
  name: string | null;
};

function cleanText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > max) return undefined;
  return trimmed === "" ? null : trimmed;
}

/** Returns the cleaned submission, or null when anything is missing or wrong. */
export function parseSubmission(body: unknown): ParsedSubmission | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!isSurveyToken(b.token)) return null;

  const answers = b.answers;
  if (!answers || typeof answers !== "object") return null;
  const scores = {} as SurveyScores;
  for (const q of SURVEY_QUESTIONS) {
    const v = (answers as Record<string, unknown>)[q.key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 4) return null;
    scores[q.key] = v;
  }

  const comment = cleanText(b.comment, COMMENT_MAX);
  const name = cleanText(b.name, NAME_MAX);
  if (comment === undefined || name === undefined) return null;
  return { token: b.token, scores, comment, name };
}

export function unansweredCount(answers: Partial<SurveyScores>): number {
  return SURVEY_QUESTIONS.filter((q) => !answers[q.key]).length;
}

export function linkStateMessage(state: Exclude<SurveyLinkState, "ok">, opensAt?: string | null): string {
  switch (state) {
    case "used":
      return "このアンケートは回答済みです。ご協力ありがとうございました。";
    case "closed":
      return "このアンケートは受付を終了しました。";
    case "not_open": {
      const when = opensAt ? formatOpenDate(opensAt) : "";
      return when ? `このアンケートは${when}から回答できます。` : "このアンケートはまだ回答できません。";
    }
    default:
      return "このリンクは無効です。配布されたQRコードまたはリンクをご確認ください。";
  }
}

export function formatOpenDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric" }).format(d);
}

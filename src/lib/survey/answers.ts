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

/** One instructor an answer is about (a request can have several chosen instructors). */
export type SurveyInstructor = { id: string; name: string | null; role: string | null };

/** The five answers (and an optional comment) about one instructor. instructorId is null only for the old one-instructor form. */
export type SurveyEntry = { instructorId: string | null; scores: SurveyScores; comment: string | null };

export type ParsedSubmission = {
  token: string;
  name: string | null;
  entries: SurveyEntry[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_SURVEY_ENTRIES = 10;

function cleanText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > max) return undefined;
  return trimmed === "" ? null : trimmed;
}

function parseScores(answers: unknown): SurveyScores | null {
  if (!answers || typeof answers !== "object") return null;
  const scores = {} as SurveyScores;
  for (const q of SURVEY_QUESTIONS) {
    const v = (answers as Record<string, unknown>)[q.key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 4) return null;
    scores[q.key] = v;
  }
  return scores;
}

/**
 * Returns the cleaned submission, or null when anything is missing or wrong.
 * New form: { token, name?, entries: [{ instructorId, answers, comment? }] } (one per instructor).
 * Old form (one instructor): { token, answers, comment?, name? }.
 */
export function parseSubmission(body: unknown): ParsedSubmission | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!isSurveyToken(b.token)) return null;
  const name = cleanText(b.name, NAME_MAX);
  if (name === undefined) return null;

  if (Array.isArray(b.entries)) {
    if (b.entries.length === 0 || b.entries.length > MAX_SURVEY_ENTRIES) return null;
    const seen = new Set<string>();
    const entries: SurveyEntry[] = [];
    for (const raw of b.entries) {
      if (!raw || typeof raw !== "object") return null;
      const e = raw as Record<string, unknown>;
      if (typeof e.instructorId !== "string" || !UUID_RE.test(e.instructorId)) return null;
      const id = e.instructorId.toLowerCase();
      if (seen.has(id)) return null;
      seen.add(id);
      const scores = parseScores(e.answers);
      const comment = cleanText(e.comment, COMMENT_MAX);
      if (!scores || comment === undefined) return null;
      entries.push({ instructorId: id, scores, comment });
    }
    return { token: b.token, name, entries };
  }

  const scores = parseScores(b.answers);
  const comment = cleanText(b.comment, COMMENT_MAX);
  if (!scores || comment === undefined) return null;
  return { token: b.token, name, entries: [{ instructorId: null, scores, comment }] };
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
      const when = opensAt ? formatOpenDateTime(opensAt) : "";
      return when ? `このアンケートは、研修の終了後（${when}以降）に回答できます。` : "このアンケートは、研修の終了後に回答できます。しばらくしてからもう一度お試しください。";
    }
    default:
      return "このリンクは無効です。配布されたQRコードまたはリンクをご確認ください。";
  }
}

/** 「10月24日 10:00」 in Japan time. */
export function formatOpenDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${Number(get("month"))}月${Number(get("day"))}日 ${get("hour")}:${get("minute")}`;
}

export function formatOpenDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric" }).format(d);
}

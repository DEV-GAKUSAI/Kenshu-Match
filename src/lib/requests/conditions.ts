// 必須／歓迎の条件 (#59) and the 確認済み／未確認／不一致 check (#60). Pure helpers, no database calls.
import { isPrefecture } from "./prefectures.ts";
import { normalizeDays } from "./schedule.ts";

export type CondKey = "years" | "materials" | "mock" | "kickoff" | "prep_training" | "daily";
export type CondLevel = "must" | "nice";
export type Condition = { key: CondKey; level: CondLevel; years?: number };
export type Answer = "yes" | "no" | "talk";
export type CheckState = "ok" | "ng" | "unknown";
export type ConditionCheck = { key: CondKey | "alldays"; label: string; level: CondLevel; state: CheckState };

export const CONDITION_ITEMS: { key: CondKey; label: string }[] = [
  { key: "years", label: "経験年数" },
  { key: "materials", label: "教材の支給・作成への対応" },
  { key: "mock", label: "模擬講義" },
  { key: "kickoff", label: "事前打合せ" },
  { key: "prep_training", label: "講師向けの事前研修" },
  { key: "daily", label: "日報の提出" },
];

/** Items answered with the new condition_answers column. The others reuse the apply columns that already exist. */
export const ANSWER_KEYS: CondKey[] = ["years", "mock", "kickoff", "daily"];

export const MAX_YEARS = 60;

export function conditionLabel(c: Condition): string {
  if (c.key === "years") return `経験${c.years ?? "?"}年以上`;
  return CONDITION_ITEMS.find((i) => i.key === c.key)?.label ?? c.key;
}

/** Safe list from stored JSON: known keys only, one per key, in the fixed order. */
export function normalizeConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map<CondKey, Condition>();
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const def = CONDITION_ITEMS.find((i) => i.key === r.key);
    if (!def || byKey.has(def.key)) continue;
    const level: CondLevel = r.level === "nice" ? "nice" : "must";
    if (def.key === "years") {
      const n = Number(r.years);
      if (!Number.isInteger(n) || n < 1 || n > MAX_YEARS) continue;
      byKey.set("years", { key: "years", level, years: n });
    } else {
      byKey.set(def.key, { key: def.key, level });
    }
  }
  return CONDITION_ITEMS.map((i) => byKey.get(i.key)).filter((c): c is Condition => !!c);
}

/** What the company form sends. */
export function conditionsPayload(list: Condition[]): Condition[] {
  return normalizeConditions(list);
}

export function normalizeAnswers(raw: unknown): Partial<Record<CondKey, Answer>> {
  const out: Partial<Record<CondKey, Answer>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const k of ANSWER_KEYS) {
    const v = r[k];
    if (v === "yes" || v === "no" || v === "talk") out[k] = v;
  }
  return out;
}

/** Only the answers the request actually asks for (extra keys are dropped). */
export function answersFor(conditions: Condition[], raw: unknown): Partial<Record<CondKey, Answer>> {
  const all = normalizeAnswers(raw);
  const asked = new Set(conditions.map((c) => c.key));
  const out: Partial<Record<CondKey, Answer>> = {};
  for (const k of ANSWER_KEYS) if (asked.has(k) && all[k]) out[k] = all[k];
  return out;
}

export type ResponseLike = {
  apply_all_days?: string | null;
  apply_materials?: string | null;
  apply_prep?: string | null;
  condition_answers?: unknown;
};
export type RequestLike = { req_conditions?: unknown; all_days_required?: boolean | null };

function fromAnswer(a: Answer | undefined): CheckState {
  return a === "yes" ? "ok" : a === "no" ? "ng" : "unknown";
}

function yearsState(c: Condition, answer: Answer | undefined, profileYears: number | null | undefined): CheckState {
  if (answer) return fromAnswer(answer);
  if (profileYears == null) return "unknown";
  return profileYears >= (c.years ?? 0) ? "ok" : "ng";
}

/**
 * The state of each condition for an application (#60). 全日程 counts as 必須 when the request needs all days.
 * 要相談 and 未回答 are both 未確認; 「不可」 on a condition is 不一致. 経験年数 may also come from the profile.
 */
export function checkResponse(req: RequestLike, resp: ResponseLike, profile?: { years_of_experience?: number | null }): ConditionCheck[] {
  const conditions = normalizeConditions(req.req_conditions);
  const answers = normalizeAnswers(resp.condition_answers);
  const checks: ConditionCheck[] = [];
  if (req.all_days_required) {
    const a = resp.apply_all_days;
    checks.push({ key: "alldays", label: "全日程への対応", level: "must", state: a === "all" ? "ok" : a === "partial" || a === "none" ? "ng" : "unknown" });
  }
  for (const c of conditions) {
    let state: CheckState;
    if (c.key === "years") state = yearsState(c, answers.years, profile?.years_of_experience);
    else if (c.key === "materials") state = resp.apply_materials ? "ok" : "unknown";
    else if (c.key === "prep_training") state = resp.apply_prep === "yes" ? "ok" : resp.apply_prep === "no" ? "ng" : "unknown";
    else state = fromAnswer(answers[c.key]);
    checks.push({ key: c.key, label: conditionLabel(c), level: c.level, state });
  }
  return checks;
}

/** For a lecturer who has not applied: only what the profile can show (経験年数); everything else is 未確認. */
export function checkProfile(req: RequestLike, profile: { years_of_experience?: number | null }): ConditionCheck[] {
  return checkResponse(req, {}, profile);
}

export type CheckSummary = { mustOk: number; mustNg: number; mustUnknown: number; niceNg: number };

export function summarizeChecks(checks: ConditionCheck[]): CheckSummary {
  const s: CheckSummary = { mustOk: 0, mustNg: 0, mustUnknown: 0, niceNg: 0 };
  for (const c of checks) {
    if (c.level === "must") {
      if (c.state === "ok") s.mustOk++;
      else if (c.state === "ng") s.mustNg++;
      else s.mustUnknown++;
    } else if (c.state === "ng") s.niceNg++;
  }
  return s;
}

/** 「必須条件：確認済み2・未確認1・不一致1」, or null when the request has no 必須 条件. */
export function checksText(checks: ConditionCheck[]): string | null {
  const s = summarizeChecks(checks);
  if (s.mustOk + s.mustNg + s.mustUnknown === 0) return null;
  const parts = [s.mustOk ? `確認済み${s.mustOk}` : null, s.mustUnknown ? `未確認${s.mustUnknown}` : null, s.mustNg ? `不一致${s.mustNg}` : null].filter(Boolean);
  return `必須条件：${parts.join("・")}`;
}

export const STATE_TEXT: Record<CheckState, string> = { ok: "確認済み", unknown: "未確認", ng: "不一致" };

/** Prefectures where the request is on site (days that are 対面 or 形態未定). Empty = online only / not set. */
export function onSitePrefectures(req: { schedule_days?: unknown }): string[] {
  const set = new Set<string>();
  for (const d of normalizeDays(req.schedule_days)) {
    if (d.format !== "online" && d.prefecture) set.add(d.prefecture);
  }
  return [...set];
}

export type AreaState = "ok" | "ng" | "na";

/**
 * Area rule (#58): an on-site request whose prefecture is not among the lecturer's 対応エリア is 不一致.
 * Online requests, requests without a prefecture, and lecturers who named no prefecture are never penalised ("na").
 */
export function areaState(req: { schedule_days?: unknown }, lecturerPrefectures: string[] | null | undefined): AreaState {
  const wanted = onSitePrefectures(req);
  const mine = (lecturerPrefectures ?? []).filter(isPrefecture);
  if (wanted.length === 0 || mine.length === 0) return "na";
  return wanted.some((p) => mine.includes(p)) ? "ok" : "ng";
}

/**
 * おすすめ (#60): the field matches AND the place is not 不一致. Everything else that matched something is 参考.
 * Used by both lists (the lecturer's 案件を探す and the company's 合いそうな講師).
 */
export function isRecommendedMatch(reasons: string[], area: AreaState): boolean {
  return reasons.includes("分野") && area !== "ng";
}

/** Adds the "エリア" chip only to something that already matched (area alone never makes a match). */
export function withAreaReason(reasons: string[], area: AreaState): string[] {
  return reasons.length > 0 && area === "ok" ? [...reasons, "エリア"] : reasons;
}

/** The line explaining a 参考 match, or null for おすすめ. */
export function referenceNote(reasons: string[], area: AreaState): string | null {
  if (isRecommendedMatch(reasons, area)) return null;
  if (reasons.includes("分野") && area === "ng") return "分野は一致していますが、実施場所が対応エリアと異なります";
  return "分野は一致していませんが、条件に一部合っています";
}

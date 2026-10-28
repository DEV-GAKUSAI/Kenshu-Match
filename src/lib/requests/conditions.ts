// 必須／歓迎の条件 (#59) and the 確認済み／未確認／不一致 check (#60). Pure helpers, no database calls.
import { isPrefecture } from "./prefectures.ts";
import { normalizeDays } from "./schedule.ts";

export type CondKey = "years" | "materials" | "mock" | "kickoff" | "prep_training" | "daily" | "skill";
export type CondLevel = "must" | "nice";
export type SkillKind = "field" | "tool";
/** A 分野 or ツール from the lecturer's own list (Mine's ケンシュウリンク tab): years and 登壇実績 are optional. */
export type SkillItem = { k: SkillKind; n: string; y?: number; t?: true };
/** years: 経験年数 (key "years") or the minimum years of a skill. kind/name/spoke are for key "skill" only. */
export type Condition = { key: CondKey; level: CondLevel; years?: number; kind?: SkillKind; name?: string; spoke?: boolean };
export type Answer = "yes" | "no" | "talk";
export type CheckState = "ok" | "ng" | "unknown";
export type ConditionCheck = { key: CondKey | "alldays"; label: string; level: CondLevel; state: CheckState };

/** The most conditions one request can hold (6 fixed items plus分野・ツール). */
export const MAX_CONDITIONS = 30;
const MAX_SKILL_NAME = 80;

export const CONDITION_ITEMS: { key: Exclude<CondKey, "skill">; label: string }[] = [
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
  if (c.key === "skill") {
    const extra = [c.years ? `${c.years}年以上` : "", c.spoke ? "登壇実績" : ""].filter(Boolean).join("・");
    return extra ? `${c.name ?? "?"}（${extra}）` : (c.name ?? "?");
  }
  return CONDITION_ITEMS.find((i) => i.key === c.key)?.label ?? c.key;
}

/** Safe list from stored JSON: known keys only, one per key, in the fixed order. */
export function normalizeConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map<CondKey, Condition>();
  const skills = new Map<string, Condition>();
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const level: CondLevel = r.level === "nice" ? "nice" : "must";
    if (r.key === "skill") {
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if ((r.kind !== "field" && r.kind !== "tool") || !name || name.length > MAX_SKILL_NAME) continue;
      const id = `${r.kind}:${name}`;
      if (skills.has(id)) continue;
      const n = Number(r.years);
      const years = Number.isInteger(n) && n >= 1 && n <= MAX_YEARS ? n : undefined;
      skills.set(id, { key: "skill", level, kind: r.kind, name, ...(years ? { years } : {}), ...(r.spoke === true ? { spoke: true } : {}) });
      continue;
    }
    const def = CONDITION_ITEMS.find((i) => i.key === r.key);
    if (!def || byKey.has(def.key)) continue;
    if (def.key === "years") {
      const n = Number(r.years);
      if (!Number.isInteger(n) || n < 1 || n > MAX_YEARS) continue;
      byKey.set("years", { key: "years", level, years: n });
    } else {
      byKey.set(def.key, { key: def.key, level });
    }
  }
  const fixed = CONDITION_ITEMS.map((i) => byKey.get(i.key)).filter((c): c is Condition => !!c);
  return [...fixed, ...skills.values()].slice(0, MAX_CONDITIONS);
}

/** Keeps a 分野・ツール condition only while its field or tool is still chosen on the request. */
export function pruneSkillConditions(list: Condition[], allowed: { kind: SkillKind; name: string }[]): Condition[] {
  const ok = new Set(allowed.map((a) => `${a.kind}:${a.name}`));
  return list.filter((c) => c.key !== "skill" || ok.has(`${c.kind}:${c.name}`));
}

/** Stored JSON (or nothing) into a clean skill list: known kinds, a name, years 0-60, one per kind+name. */
export function normalizeSkillItems(raw: unknown): SkillItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SkillItem[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const name = typeof r.n === "string" ? r.n.trim() : "";
    if ((r.k !== "field" && r.k !== "tool") || !name || name.length > MAX_SKILL_NAME) continue;
    const id = `${r.k}:${name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const y = typeof r.y === "number" && Number.isInteger(r.y) && r.y >= 0 && r.y <= MAX_YEARS ? r.y : undefined;
    out.push({ k: r.k, n: name, ...(y !== undefined ? { y } : {}), ...(r.t === true ? { t: true as const } : {}) });
  }
  return out;
}

/**
 * One 分野・ツール condition against the lecturer's saved list (#60).
 * No saved list at all = 未確認. A saved list without the item = 不一致 (they did not list it).
 * A field the lecturer holds in Kenshu Link's own expertise (fieldNames) counts as listed, with no years.
 * Years not given = 未確認; 登壇実績 not ticked = 不一致.
 */
export function skillState(c: Condition, items: SkillItem[], fieldNames: readonly string[] = []): CheckState {
  const listedField = c.kind === "field" && !!c.name && fieldNames.includes(c.name);
  if (items.length === 0 && !listedField) return "unknown";
  const item = items.find((i) => i.k === c.kind && i.n === c.name) ?? (listedField ? ({ k: "field", n: c.name as string } as SkillItem) : undefined);
  if (!item) return "ng";
  const parts: CheckState[] = [];
  if (c.years) parts.push(item.y === undefined ? "unknown" : item.y >= c.years ? "ok" : "ng");
  if (c.spoke) parts.push(item.t ? "ok" : "ng");
  if (parts.includes("ng")) return "ng";
  if (parts.includes("unknown")) return "unknown";
  return "ok";
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
export type ProfileLike = { years_of_experience?: number | null; training_skills?: unknown; expertise_fields?: string[] | null };

export function checkResponse(req: RequestLike, resp: ResponseLike, profile?: ProfileLike): ConditionCheck[] {
  const conditions = normalizeConditions(req.req_conditions);
  const answers = normalizeAnswers(resp.condition_answers);
  const checks: ConditionCheck[] = [];
  const skillItems = normalizeSkillItems(profile?.training_skills);
  if (req.all_days_required) {
    const a = resp.apply_all_days;
    checks.push({ key: "alldays", label: "全日程への対応", level: "must", state: a === "all" ? "ok" : a === "partial" || a === "none" ? "ng" : "unknown" });
  }
  for (const c of conditions) {
    let state: CheckState;
    if (c.key === "skill") state = skillState(c, skillItems, profile?.expertise_fields ?? []);
    else if (c.key === "years") state = yearsState(c, answers.years, profile?.years_of_experience);
    else if (c.key === "materials") state = resp.apply_materials ? "ok" : "unknown";
    else if (c.key === "prep_training") state = resp.apply_prep === "yes" ? "ok" : resp.apply_prep === "no" ? "ng" : "unknown";
    else state = fromAnswer(answers[c.key as Exclude<CondKey, "skill">]);
    checks.push({ key: c.key, label: conditionLabel(c), level: c.level, state });
  }
  return checks;
}

/** For a lecturer who has not applied: only what the profile can show (経験年数); everything else is 未確認. */
export function checkProfile(req: RequestLike, profile: ProfileLike): ConditionCheck[] {
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

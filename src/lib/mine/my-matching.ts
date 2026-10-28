import { normalizeSkillItems, type SkillItem } from "../requests/conditions.ts";

/** What おすすめ needs to know about the signed-in instructor. */
export type MatchingProfile = {
  workStyle: string | null;
  desiredRateMin: number | null;
  expertiseIds: Set<string>;
  prefectures: string[];
  /** 教えられる分野・ツール from Mine (names from Kenshu Link's own lists). */
  skills: SkillItem[];
};

/** The part of GET /api/instructors/me that matters here. */
export type MineMe = {
  linked?: boolean;
  prefectures?: unknown;
  hourly_rate?: unknown;
  work_style?: unknown;
  training_skills?: unknown;
};

const STYLES = new Set(["ONLINE", "ONSITE", "HYBRID"]);

/**
 * A lecturer linked to Mine keeps 働き方・希望単価・対応エリア・教えられる分野・ツール in Mine; the old
 * Kenshu Link columns are no longer kept up to date for them, so Mine's values replace them (also when empty).
 * Not linked, or Mine could not be reached: the old values stay.
 */
export function applyMineToMatching(base: MatchingProfile, me: MineMe | null | undefined): MatchingProfile {
  if (!me || me.linked !== true) return base;
  return {
    ...base,
    workStyle: typeof me.work_style === "string" && STYLES.has(me.work_style) ? me.work_style : null,
    desiredRateMin: typeof me.hourly_rate === "number" ? me.hourly_rate : null,
    prefectures: Array.isArray(me.prefectures) ? me.prefectures.filter((p): p is string => typeof p === "string") : [],
    skills: normalizeSkillItems(me.training_skills),
  };
}

/** The tool and field names a request asks for (its own field plus the ticked 技術・製品・ツール). */
export function toolNamesOf(optionIds: readonly string[] | null | undefined, toolNameById: Record<string, string>): string[] {
  return (optionIds ?? []).map((id) => toolNameById[id]).filter((n): n is string => !!n);
}

/** Reasons from the saved skills: the request's own field, and any ticked tool the lecturer lists. */
export function skillReasons(fieldName: string | undefined, requestTools: readonly string[], skills: readonly SkillItem[]): { field: boolean; tool: boolean } {
  return {
    field: !!fieldName && skills.some((s) => s.k === "field" && s.n === fieldName),
    tool: requestTools.some((t) => skills.some((s) => s.k === "tool" && s.n === t)),
  };
}

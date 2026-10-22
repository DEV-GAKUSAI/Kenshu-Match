/**
 * 稼働条件 (#56): period, languages and MAIN/SUB experience an instructor set in Mine.
 * Pure helpers (no "@/" imports) so they can be tested with node --test.
 */
export type AvailabilityFacts = {
  available_from?: string | null;
  available_until?: string | null;
  training_languages?: string[] | null;
  roles?: string[] | null;
};

export type AvailabilityFilter = {
  /** yyyy-mm-dd, empty = not set */
  from: string;
  until: string;
  languages: string[];
  roles: string[];
};

export const ROLE_LABEL: Record<string, string> = { MAIN: "メイン講師", SUB: "サブ講師" };

export const EMPTY_AVAILABILITY_FILTER: AvailabilityFilter = { from: "", until: "", languages: [], roles: [] };

export function isAvailabilityFilterActive(f: AvailabilityFilter): boolean {
  return !!(f.from || f.until || f.languages.length || f.roles.length);
}

/**
 * Rules (owner decision 10/22):
 * - Period: the company enters a range; the instructor matches when their period covers the WHOLE range.
 *   An instructor with no period (or one open end) is available any time on that side.
 *   If the company enters only one date, it is treated as a single day.
 * - Languages / experience: an instructor with an empty list is hidden while that filter is on.
 *   Several chips mean "any of these".
 */
export function matchesAvailability(facts: AvailabilityFacts, f: AvailabilityFilter): boolean {
  const from = f.from || f.until;
  const until = f.until || f.from;
  if (from && until) {
    const a = facts.available_from;
    const b = facts.available_until;
    if (a && a > from) return false;
    if (b && b < until) return false;
  }
  if (f.languages.length) {
    const have = facts.training_languages ?? [];
    if (!f.languages.some((l) => have.includes(l))) return false;
  }
  if (f.roles.length) {
    const have = facts.roles ?? [];
    if (!f.roles.some((r) => have.includes(r))) return false;
  }
  return true;
}

function md(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** "10/26〜12/20", "10/26から", "12/20まで" or "いつでも". */
export function periodLabel(facts: AvailabilityFacts): string {
  const a = facts.available_from;
  const b = facts.available_until;
  if (a && b) return `${md(a)}〜${md(b)}`;
  if (a) return `${md(a)}から`;
  if (b) return `${md(b)}まで`;
  return "いつでも";
}

export function rolesLabel(roles: string[] | null | undefined): string {
  return (roles ?? []).map((r) => ROLE_LABEL[r] ?? r).join("、");
}

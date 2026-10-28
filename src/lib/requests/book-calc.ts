// 自社の講師台帳 (#57): rules and helpers for the ledger's own fields, search and favourites. Pure, no database.
import { amountError, formatMoney, type BudgetUnit } from "./money.ts";
import { matchesSearch } from "./search.ts";

/** Same limits as migration 194. */
export const MAX_STRENGTHS = 20;
export const MAX_SPEAKING = 1000;

export type BookKindLike = "candidate" | "regular";

export type BookLike = {
  entry_id: string;
  instructor_id: string | null;
  external_name: string | null;
  external_contact: string | null;
  list_kind: BookKindLike;
  note: string | null;
  strength_field_ids: string[];
  past_rate_amount: number | null;
  past_rate_unit: string | null;
  speaking_record: string | null;
  is_favorite: boolean;
  /** Optional: only needed for sorting. */
  rating?: number | null;
  updated_at?: string;
};

export type BookFormInput = { strengthIds: string[]; rateText: string; rateUnit: BudgetUnit; speaking: string };

const KIND_WORD: Record<BookKindLike, string> = { candidate: "候補", regular: "取引先" };

/** The yen amount typed in the 過去単価 box: whole number, full-width digits and commas allowed. NaN when it is not a number. */
function rateNumber(text: string): number {
  const t = text.normalize("NFKC").replace(/[,\s]/g, "");
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

/** Message for the edit form, or null when fine. An empty 過去単価 is fine (nothing saved). */
export function bookFieldsError(v: BookFormInput): string | null {
  if (v.strengthIds.length > MAX_STRENGTHS) return `得意領域は${MAX_STRENGTHS}件まで選べます。`;
  if (v.speaking.length > MAX_SPEAKING) return `登壇実績は${MAX_SPEAKING}文字以内で入力してください。`;
  if (v.rateText.trim()) {
    const n = rateNumber(v.rateText);
    if (Number.isNaN(n)) return "過去単価は半角の数字（円）で入力してください。";
    return amountError(n, "過去単価");
  }
  return null;
}

/** What is saved for the 過去単価 box: both parts, or both empty. */
export function parsePastRate(rateText: string, unit: BudgetUnit): { amount: number | null; unit: BudgetUnit | null } {
  if (!rateText.trim()) return { amount: null, unit: null };
  const n = rateNumber(rateText);
  return Number.isNaN(n) ? { amount: null, unit: null } : { amount: n, unit };
}

/** 「¥15,000／時間」, or an empty text when no rate is saved. */
export function pastRateText(e: Pick<BookLike, "past_rate_amount" | "past_rate_unit">): string {
  if (e.past_rate_amount === null || e.past_rate_amount === undefined) return "";
  return formatMoney(e.past_rate_amount, e.past_rate_unit, null);
}

/** Everything a search should look at for one entry. */
export function bookSearchText(e: BookLike, name: string, fieldNames: Record<string, string>): string {
  return [
    name,
    e.external_contact,
    e.note,
    e.strength_field_ids.map((id) => fieldNames[id]).filter(Boolean).join(" "),
    e.speaking_record,
    pastRateText(e),
    KIND_WORD[e.list_kind],
    e.is_favorite ? "お気に入り" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export type BookSort = "favorite" | "newest" | "rate" | "rating";

export type BookFilter = { query: string; kind: "all" | BookKindLike; favoriteOnly: boolean; fieldId: string; sort?: BookSort };

const UNIT_ORDER: Record<string, number> = { hour: 0, day: 1, total: 2 };

/** One line of the 登壇実績 for a list: spaces and line breaks flattened, cut with … when long. */
export function shortSpeaking(text: string | null | undefined, max = 40): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Sorts a copy. rate: by unit (時間 → 日 → 総額), then amount low to high; entries without a rate go last. rating: high to low, unrated last. */
function sortBook<T extends BookLike>(list: T[], sort: BookSort): T[] {
  if (sort === "newest") return [...list].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  if (sort === "rating") return [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  if (sort === "rate") {
    const key = (e: T) => (e.past_rate_amount === null || e.past_rate_amount === undefined ? [99, 0] : [UNIT_ORDER[e.past_rate_unit ?? ""] ?? 98, e.past_rate_amount]);
    return [...list].sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]);
  }
  return [...list.filter((e) => e.is_favorite), ...list.filter((e) => !e.is_favorite)];
}

/** The entries to show: filters applied, then sorted (default: お気に入り first, the rest keep their order). */
export function filterBook<T extends BookLike>(entries: T[], f: BookFilter, nameOf: (e: T) => string, fieldNames: Record<string, string>): T[] {
  const shown = entries.filter((e) => {
    if (f.kind !== "all" && e.list_kind !== f.kind) return false;
    if (f.favoriteOnly && !e.is_favorite) return false;
    if (f.fieldId && !e.strength_field_ids.includes(f.fieldId)) return false;
    return matchesSearch(f.query, bookSearchText(e, nameOf(e), fieldNames));
  });
  return sortBook(shown, f.sort ?? "favorite");
}

/** Ledger entries that can still be added as a candidate of a request (not yet candidates), favourites first. */
export function addableCandidates<T extends BookLike>(entries: T[], candidateEntryIds: string[]): T[] {
  const taken = new Set(candidateEntryIds);
  const open = entries.filter((e) => !taken.has(e.entry_id));
  return [...open.filter((e) => e.is_favorite), ...open.filter((e) => !e.is_favorite)];
}

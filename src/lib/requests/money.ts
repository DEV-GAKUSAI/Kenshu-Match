// How a price is written everywhere (#41 案件の金額 / #44 登壇料・経費・支払条件).
// One place, so lists, detail pages, applications and results all say the same thing.

/** Upper limit for any yen amount typed in a request or a quote (#50). Same number as migration 181. */
export const MAX_AMOUNT = 10_000_000;

/** Message when an amount is not a whole yen number of 1 .. MAX_AMOUNT; null when fine. */
export function amountError(value: number, label: string): string | null {
  if (!Number.isInteger(value) || value < 1) return `${label}は1円以上の整数で入力してください。`;
  if (value > MAX_AMOUNT) return `${label}は${MAX_AMOUNT.toLocaleString()}円以下で入力してください。`;
  return null;
}

export type BudgetUnit = "hour" | "day" | "total";
export type TaxMode = "included" | "excluded" | "unspecified";
export type CostShare = "company" | "included" | "none" | "unspecified";
export type PrepCost = "included" | "extra" | "unspecified";
/** 金額を決める / 範囲 / 応相談 (#44). Old requests are all "fixed". */
export type BudgetMode = "fixed" | "range" | "negotiable";

export type MoneyFields = {
  budget: number | null;
  budget_unit?: string | null;
  budget_mode?: string | null;
  budget_max?: number | null;
  prep_amount?: number | null;
  pretraining_amount?: number | null;
  tax_mode?: string | null;
  transport_cost?: string | null;
  lodging_cost?: string | null;
  prep_cost?: string | null;
  payment_terms?: string | null;
};

export const UNIT_OPTIONS: { value: BudgetUnit; label: string }[] = [
  { value: "hour", label: "時間あたり" },
  { value: "day", label: "1日あたり" },
  { value: "total", label: "総額（研修全体）" },
];

export function normalUnit(u: string | null | undefined): BudgetUnit {
  return u === "day" || u === "total" ? u : "hour";
}

function taxText(t: string | null | undefined): string {
  return t === "included" ? "税込" : t === "excluded" ? "税別" : "";
}

/** 「¥15,000／時間（税別）」「¥300,000（総額・税込）」 */
export function formatMoney(amount: number | string | null | undefined, unit: string | null | undefined, tax: string | null | undefined): string {
  const n = Number(amount || 0);
  const yen = `¥${n.toLocaleString()}`;
  const u = normalUnit(unit);
  const t = taxText(tax);
  if (u === "total") return t ? `${yen}（総額・${t}）` : `${yen}（総額）`;
  const per = u === "day" ? "／日" : "／時間";
  return t ? `${yen}${per}（${t}）` : `${yen}${per}`;
}

export function budgetMode(r: { budget_mode?: string | null }): BudgetMode {
  return r.budget_mode === "range" || r.budget_mode === "negotiable" ? r.budget_mode : "fixed";
}

const UNIT_WORD: Record<BudgetUnit, string> = { hour: "時間あたり", day: "1日あたり", total: "総額" };

/** 「¥10,000〜¥15,000／時間（税別）」 */
export function formatRange(min: number | string | null | undefined, max: number | string | null | undefined, unit: string | null | undefined, tax: string | null | undefined): string {
  const u = normalUnit(unit);
  const t = taxText(tax);
  const yen = `¥${Number(min || 0).toLocaleString()}〜¥${Number(max || 0).toLocaleString()}`;
  if (u === "total") return t ? `${yen}（総額・${t}）` : `${yen}（総額）`;
  const per = u === "day" ? "／日" : "／時間";
  return t ? `${yen}${per}（${t}）` : `${yen}${per}`;
}

/** 「応相談（時間あたり・税別）」 */
export function formatNegotiable(unit: string | null | undefined, tax: string | null | undefined): string {
  const t = taxText(tax);
  const w = UNIT_WORD[normalUnit(unit)];
  return t ? `応相談（${w}・${t}）` : `応相談（${w}）`;
}

/** The budget as words, without the 「予算」 prefix; null when none was given. */
export function budgetAmountText(r: MoneyFields): string | null {
  const mode = budgetMode(r);
  if (mode === "negotiable") return formatNegotiable(r.budget_unit, r.tax_mode);
  if (mode === "range" && r.budget && r.budget_max) return formatRange(r.budget, r.budget_max, r.budget_unit, r.tax_mode);
  return r.budget ? formatMoney(r.budget, r.budget_unit, r.tax_mode) : null;
}

/** 「予算 ¥15,000／時間（税別）」 / 「予算の目安 ¥10,000〜¥15,000／時間」 / 「予算 応相談（時間あたり）」, or null when no budget was given. */
export function budgetText(r: MoneyFields): string | null {
  const t = budgetAmountText(r);
  // A range is a guide, not a promise of the top amount (#44), so it is worded 「予算の目安」.
  return t ? `${budgetMode(r) === "range" ? "予算の目安" : "予算"} ${t}` : null;
}

/** The highest price the company would pay, as a number; null for 応相談 or no budget. Used only to hint a match. */
export function budgetUpper(r: MoneyFields): number | null {
  const mode = budgetMode(r);
  if (mode === "negotiable") return null;
  if (mode === "range") return r.budget_max ?? null;
  return r.budget ?? null;
}

/**
 * For a range budget: is the lecturer's quote inside it? null when it cannot be told (not a range, no quote, other unit,
 * or one side is 税込 and the other 税別, which cannot be compared fairly).
 */
export function quoteVsRange(r: MoneyFields, quote: { quote_price: number | string | null; quote_unit?: string | null; quote_tax_mode?: string | null }): "in" | "out" | null {
  if (budgetMode(r) !== "range" || !r.budget || !r.budget_max || !quote.quote_price) return null;
  if (quote.quote_unit && normalUnit(quote.quote_unit) !== normalUnit(r.budget_unit)) return null;
  const sides = [quote.quote_tax_mode, r.tax_mode].filter((t) => t === "included" || t === "excluded");
  if (sides.length === 2 && sides[0] !== sides[1]) return null;
  const q = Number(quote.quote_price);
  return q >= r.budget && q <= r.budget_max ? "in" : "out";
}

/** 「見積り ¥15,000／時間（税別）」 for an instructor's quote. */
export function quoteText(resp: { quote_price: number | string | null; quote_unit?: string | null; quote_tax_mode?: string | null }): string {
  return `見積り ${formatMoney(resp.quote_price, resp.quote_unit, resp.quote_tax_mode)}`;
}

const SHARE_TEXT: Record<string, string> = { company: "企業が負担", included: "料金に含む", none: "なし" };

/** The extra conditions as short lines. Unspecified items are left out. */
export function costLines(r: MoneyFields): string[] {
  const out: string[] = [];
  if (r.transport_cost && SHARE_TEXT[r.transport_cost]) out.push(`交通費：${SHARE_TEXT[r.transport_cost]}`);
  if (r.lodging_cost && SHARE_TEXT[r.lodging_cost]) out.push(`宿泊費：${SHARE_TEXT[r.lodging_cost]}`);
  if (r.prep_cost === "included") out.push("準備・事前打合せ：料金に含む");
  else if (r.prep_cost === "extra") out.push(r.prep_amount ? `準備・事前打合せ：別途（¥${Number(r.prep_amount).toLocaleString()}）` : "準備・事前打合せ：別途");
  if (r.pretraining_amount) out.push(`事前研修費：¥${Number(r.pretraining_amount).toLocaleString()}（別途）`);
  if (r.payment_terms && r.payment_terms.trim()) out.push(`支払条件：${r.payment_terms.trim()}`);
  return out;
}

/** Is a request price comparable with an instructor's hourly rate? Only per-hour prices are. */
export function isHourly(r: { budget_unit?: string | null }): boolean {
  return normalUnit(r.budget_unit) === "hour";
}

/** What the company typed in the budget area (as text), for checks and the live preview. */
export type BudgetInput = { mode: BudgetMode; budget: string; budgetMax: string };

/** Message for a wrong budget entry; null when fine. 金額を決める may stay empty (as before). */
export function budgetInputError(v: BudgetInput): string | null {
  if (v.mode === "negotiable") return null;
  if (v.mode === "fixed") return v.budget.trim() ? amountError(Number(v.budget), "予算") : null;
  const min = amountError(Number(v.budget), "予算の下限");
  if (!v.budget.trim() || min) return min ?? "予算の下限を入力してください。";
  const max = amountError(Number(v.budgetMax), "予算の上限");
  if (!v.budgetMax.trim() || max) return max ?? "予算の上限を入力してください。";
  return Number(v.budgetMax) > Number(v.budget) ? null : "上限は下限より大きい金額にしてください。";
}

/** Message for the two extra cost amounts; empty is fine. */
export function costAmountError(v: { prep: string; pretraining: string }): string | null {
  if (v.prep.trim()) {
    const e = amountError(Number(v.prep), "準備・事前打合せ費");
    if (e) return e;
  }
  if (v.pretraining.trim()) {
    const e = amountError(Number(v.pretraining), "事前研修費");
    if (e) return e;
  }
  return null;
}

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

export type MoneyFields = {
  budget: number | null;
  budget_unit?: string | null;
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

/** 「予算 ¥15,000／時間（税別）」, or null when no budget was given. */
export function budgetText(r: MoneyFields): string | null {
  return r.budget ? `予算 ${formatMoney(r.budget, r.budget_unit, r.tax_mode)}` : null;
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
  else if (r.prep_cost === "extra") out.push("準備・事前打合せ：別途");
  if (r.payment_terms && r.payment_terms.trim()) out.push(`支払条件：${r.payment_terms.trim()}`);
  return out;
}

/** Is a request price comparable with an instructor's hourly rate? Only per-hour prices are. */
export function isHourly(r: { budget_unit?: string | null }): boolean {
  return normalUnit(r.budget_unit) === "hour";
}

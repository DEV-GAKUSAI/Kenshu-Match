// Filters of the lecturer's 公募中の依頼 page (#61): 職種, 開催期間, 単価の種類と金額, 募集状況.
// Pure helpers (the page keeps the screen state).

import { budgetUpper, normalUnit, type BudgetUnit, type MoneyFields } from "./money.ts";
import { normalizeSlots } from "./roles.ts";

/** The role names used across the given requests (for the 職種 dropdown), in the order first seen. */
export function roleNamesOf(requests: { role_slots?: unknown }[]): string[] {
  const out: string[] = [];
  for (const r of requests) for (const s of normalizeSlots(r.role_slots)) if (!out.includes(s.name)) out.push(s.name);
  return out;
}

/** Does the request recruit this role? (empty filter = yes) */
export function matchesRole(roleSlots: unknown, role: string): boolean {
  if (!role) return true;
  return normalizeSlots(roleSlots).some((s) => s.name === role);
}

/** Does one of the dated days fall inside from..to (YYYY-MM-DD, either may be empty)? Requests without a date never match a period. */
export function matchesPeriod(days: { date: string }[], from: string, to: string): boolean {
  if (!from && !to) return true;
  return days.some((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && (!from || d.date >= from) && (!to || d.date <= to));
}

export const UNIT_FILTER_TEXT: Record<BudgetUnit, string> = { hour: "時間", day: "日", total: "総額" };

/**
 * 単価の種類と金額 (円以上). With an amount but no unit chosen, hours are compared (as before).
 * The amount is compared with the upper end of the budget; 応相談 never matches an amount.
 */
export function matchesAmount(r: MoneyFields, unit: "" | BudgetUnit, minAmount: number): boolean {
  const wanted: "" | BudgetUnit = unit || (minAmount > 0 ? "hour" : "");
  if (wanted && normalUnit(r.budget_unit) !== wanted) return false;
  if (minAmount > 0) {
    const upper = budgetUpper(r);
    if (upper == null || upper < minAmount) return false;
  }
  return true;
}

export type OpenState = "" | "open" | "closed";

/** 応募可能・あなたに合う案件: recruiting (deadline not passed) or closed. "" shows both. */
export function matchesOpenState(deadlinePassed: boolean, state: OpenState): boolean {
  if (state === "open") return !deadlinePassed;
  if (state === "closed") return deadlinePassed;
  return true;
}

export type MineState = "" | "selecting" | "decided" | "done" | "ended";

export const MINE_STATE_TEXT: Record<Exclude<MineState, "">, string> = { selecting: "選考中", decided: "決定", done: "開催済み", ended: "終了・取り下げ" };

/** 応募済み: group the status shown on the card (see displayStatus on the page). */
export function mineStateOf(statusKey: string): Exclude<MineState, ""> | null {
  if (statusKey === "quoted" || statusKey === "pending" || statusKey === "closed") return "selecting";
  if (statusKey === "selected") return "decided";
  if (statusKey === "completed") return "done";
  if (statusKey === "rejected" || statusKey === "not-selected") return "ended";
  return null;
}

export function matchesMineState(statusKey: string, state: MineState): boolean {
  return !state || mineStateOf(statusKey) === state;
}

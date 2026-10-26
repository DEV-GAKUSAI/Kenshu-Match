// 注文書 (#51): the 明細 table, the totals with 消費税 (10%) and the difference between two versions.

import { formatMoney, normalUnit } from "./money.ts";

export const TAX_RATE = 0.1;
export const MAX_ITEMS = 20;

export type OrderItem = { name: string; qty: number; unit_price: number };

export type OrderLike = {
  title?: string | null;
  schedule_text?: string | null;
  amount: number | null;
  amount_unit: string | null;
  tax_mode: string | null;
  main_qty?: number | null;
  items?: unknown;
  transport_cost?: string | null;
  lodging_cost?: string | null;
  prep_cost?: string | null;
  payment_terms?: string | null;
  note?: string | null;
};

export type OrderLine = { name: string; qty: number | null; qtyLabel: string; unitPrice: number | null; amount: number | null };

export type OrderTotals = {
  lines: OrderLine[];
  /** 小計 (excl. tax); null when a line cannot be calculated (hour/day price without 数量) */
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  /** 税込 / 税別 / 税の指定なし */
  taxLabel: string;
  note: string | null;
};

export function normalizeItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value)) return [];
  const out: OrderItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = String(r.name ?? "").trim().slice(0, 50);
    const qty = Number(r.qty);
    const unit_price = Number(r.unit_price);
    if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit_price) || unit_price < 0) continue;
    out.push({ name, qty, unit_price: Math.trunc(unit_price) });
  }
  return out.slice(0, MAX_ITEMS);
}

const QTY_LABEL: Record<string, string> = { hour: "時間", day: "日", total: "式" };

/** The lines and totals. 税込: the amounts already include tax (tax is shown inside). 税別: 10% is added. Rounded down. */
export function calcOrder(o: OrderLike): OrderTotals {
  const unit = normalUnit(o.amount_unit);
  const lines: OrderLine[] = [];
  if (o.amount) {
    const qty = unit === "total" ? 1 : o.main_qty ?? null;
    lines.push({ name: "登壇料", qty, qtyLabel: QTY_LABEL[unit], unitPrice: o.amount, amount: qty ? Math.round(qty * o.amount) : null });
  }
  for (const it of normalizeItems(o.items)) {
    lines.push({ name: it.name, qty: it.qty, qtyLabel: "", unitPrice: it.unit_price, amount: Math.round(it.qty * it.unit_price) });
  }
  const taxLabel = o.tax_mode === "included" ? "税込" : o.tax_mode === "excluded" ? "税別" : "税の指定なし";
  const unknown = lines.some((l) => l.amount === null);
  if (unknown || lines.length === 0) {
    return { lines, subtotal: null, tax: null, total: null, taxLabel, note: lines.length ? "数量（時間数・日数）が未入力のため、合計は表示されません。" : null };
  }
  const sum = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  if (o.tax_mode === "excluded") {
    const tax = Math.floor(sum * TAX_RATE);
    return { lines, subtotal: sum, tax, total: sum + tax, taxLabel, note: null };
  }
  if (o.tax_mode === "included") {
    const tax = Math.floor((sum * TAX_RATE) / (1 + TAX_RATE));
    return { lines, subtotal: sum - tax, tax, total: sum, taxLabel, note: "金額は税込です。消費税は内税の目安です。" };
  }
  return { lines, subtotal: sum, tax: null, total: sum, taxLabel, note: "税の指定がないため、消費税は計算していません。" };
}

const SHARE: Record<string, string> = { company: "企業が負担", included: "料金に含む", none: "なし", extra: "別途" };

export type OrderDiff = { label: string; before: string; after: string };

function itemsText(v: unknown): string {
  const items = normalizeItems(v);
  return items.length ? items.map((i) => `${i.name} ${i.qty}×¥${i.unit_price.toLocaleString()}`).join("、") : "なし";
}

/** What changed from an older version of the order to a newer one (empty when nothing). */
export function diffOrders(a: OrderLike, b: OrderLike): OrderDiff[] {
  const out: OrderDiff[] = [];
  const add = (label: string, before: string, after: string) => {
    if (before !== after) out.push({ label, before: before || "なし", after: after || "なし" });
  };
  add("件名", a.title ?? "", b.title ?? "");
  add("日程", (a.schedule_text ?? "").replace(/\n/g, " / "), (b.schedule_text ?? "").replace(/\n/g, " / "));
  add("金額", a.amount ? formatMoney(a.amount, a.amount_unit, a.tax_mode) : "", b.amount ? formatMoney(b.amount, b.amount_unit, b.tax_mode) : "");
  add("数量", a.main_qty ? String(a.main_qty) : "", b.main_qty ? String(b.main_qty) : "");
  add("明細", itemsText(a.items), itemsText(b.items));
  add("交通費", SHARE[a.transport_cost ?? ""] ?? "", SHARE[b.transport_cost ?? ""] ?? "");
  add("宿泊費", SHARE[a.lodging_cost ?? ""] ?? "", SHARE[b.lodging_cost ?? ""] ?? "");
  add("準備・事前打合せ", SHARE[a.prep_cost ?? ""] ?? "", SHARE[b.prep_cost ?? ""] ?? "");
  add("支払条件", (a.payment_terms ?? "").trim(), (b.payment_terms ?? "").trim());
  add("備考", (a.note ?? "").trim(), (b.note ?? "").trim());
  return out;
}

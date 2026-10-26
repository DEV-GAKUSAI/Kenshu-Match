// 請求書 (#52): the 明細 and totals (same rules as the 注文書), the 振込先 / 登録番号 checks and the difference between two versions.

import { calcOrder, type OrderTotals } from "./order-calc.ts";
import { formatMoney } from "./money.ts";

export const RECEIPT_MAX_FILES = 5;
/** 4 MB: the hosting limit for one upload request is 4.5 MB. */
export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024;
export const RECEIPT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const BANK_TYPES = ["普通", "当座", "貯蓄"] as const;

export type BankInfo = { bank: string; branch: string; type: string; number: string; holder: string };
export type Receipt = { path: string; name: string; size: number; type: string };

export type InvoiceLike = {
  title?: string | null;
  base_amount: number | null;
  amount_unit: string | null;
  tax_mode: string | null;
  quantity?: number | null;
  extra_amount?: number | null;
  extra_note?: string | null;
  note?: string | null;
  due_date?: string | null;
  bank_info?: unknown;
  registration_no?: string | null;
  receipts?: unknown;
};

export function normalizeBank(value: unknown): BankInfo | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const s = (k: string) => String(r[k] ?? "").trim();
  const out = { bank: s("bank"), branch: s("branch"), type: s("type"), number: s("number"), holder: s("holder") };
  return out.bank || out.branch || out.number || out.holder ? out : null;
}

export function normalizeReceipts(value: unknown): Receipt[] {
  if (!Array.isArray(value)) return [];
  const out: Receipt[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const path = String(r.path ?? "");
    const name = String(r.name ?? "");
    if (!path || !name) continue;
    out.push({ path, name, size: Number(r.size) || 0, type: String(r.type ?? "") });
  }
  return out.slice(0, RECEIPT_MAX_FILES);
}

/** Full-width digits and letters become half-width (people type 口座番号 and T番号 in either). */
export function toHalfWidth(s: string): string {
  return s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** null = fine. 振込先 is all-or-nothing: either every field is filled or none. */
export function bankError(b: BankInfo | null): string | null {
  if (!b) return null;
  if (!b.bank || !b.branch || !b.type || !b.number || !b.holder) return "振込先は、銀行名・支店名・種別・口座番号・口座名義をすべて入力してください。";
  if (b.bank.length > 50 || b.branch.length > 50) return "銀行名・支店名は50文字以内で入力してください。";
  if (!(BANK_TYPES as readonly string[]).includes(b.type)) return "口座の種別を選んでください。";
  if (!/^[0-9]{4,10}$/.test(b.number)) return "口座番号は4〜10桁の数字で入力してください。";
  if (b.holder.length > 60) return "口座名義は60文字以内で入力してください。";
  return null;
}

export function registrationError(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return /^T[0-9]{13}$/.test(t) ? null : "登録番号は「T」と13桁の数字で入力してください（例：T1234567890123）。";
}

export function receiptError(file: { name: string; size: number; type: string }, count: number): string | null {
  if (count >= RECEIPT_MAX_FILES) return `領収書は${RECEIPT_MAX_FILES}ファイルまでです。`;
  if (!(RECEIPT_TYPES as readonly string[]).includes(file.type)) return "領収書は PDF・JPG・PNG のファイルを選んでください。";
  if (file.size <= 0) return "空のファイルは添付できません。";
  if (file.size > RECEIPT_MAX_BYTES) return "領収書は1ファイル4MBまでです。";
  return null;
}

export function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** The lines and totals: 講師料 (数量×単価) and the 追加費用 as one more line; same tax rules as the order. */
export function calcInvoice(inv: InvoiceLike): OrderTotals {
  const extra = inv.extra_amount && inv.extra_amount > 0 ? Math.trunc(inv.extra_amount) : 0;
  const items = extra > 0 ? [{ name: inv.extra_note ? `追加費用：${inv.extra_note}`.slice(0, 50) : "追加費用", qty: 1, unit_price: extra }] : [];
  return calcOrder({ amount: inv.base_amount, amount_unit: inv.amount_unit, tax_mode: inv.tax_mode, main_qty: inv.quantity ?? null, items });
}

export function bankText(b: BankInfo | null): string {
  return b ? `${b.bank} ${b.branch} ${b.type} ${b.number} ${b.holder}` : "";
}

/** 2026-11-30 → 2026年11月30日 */
export function dayText(d?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d ?? "");
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : "";
}

export type InvoiceDiff = { label: string; before: string; after: string };

/** What changed from an older version of the invoice to a newer one (empty when nothing). */
export function diffInvoices(a: InvoiceLike, b: InvoiceLike): InvoiceDiff[] {
  const out: InvoiceDiff[] = [];
  const add = (label: string, before: string, after: string) => {
    if (before !== after) out.push({ label, before: before || "なし", after: after || "なし" });
  };
  add("講師料", a.base_amount ? formatMoney(a.base_amount, a.amount_unit, a.tax_mode) : "", b.base_amount ? formatMoney(b.base_amount, b.amount_unit, b.tax_mode) : "");
  add("時間数・日数", a.quantity ? String(a.quantity) : "", b.quantity ? String(b.quantity) : "");
  add("追加費用", a.extra_amount ? `¥${Number(a.extra_amount).toLocaleString("ja-JP")}` : "", b.extra_amount ? `¥${Number(b.extra_amount).toLocaleString("ja-JP")}` : "");
  add("追加費用の内容", (a.extra_note ?? "").trim(), (b.extra_note ?? "").trim());
  add("支払期限", dayText(a.due_date), dayText(b.due_date));
  add("振込先", bankText(normalizeBank(a.bank_info)), bankText(normalizeBank(b.bank_info)));
  add("登録番号", a.registration_no ?? "", b.registration_no ?? "");
  add("領収書", normalizeReceipts(a.receipts).map((r) => r.name).join("、"), normalizeReceipts(b.receipts).map((r) => r.name).join("、"));
  add("備考", (a.note ?? "").trim(), (b.note ?? "").trim());
  return out;
}

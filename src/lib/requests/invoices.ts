import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { normalizeBank, normalizeReceipts, type BankInfo, type Receipt } from "./invoice-calc.ts";

// 請求管理・請求書 (#52). The rules are in the database (migration 158).

export type InvoiceStatus = "submitted" | "confirmed" | "returned" | "paid";

export type InvoiceRow = {
  invoice_id: string;
  request_id: string;
  response_id: string;
  requester_id: string;
  instructor_id: string;
  invoice_no: string;
  title: string;
  base_amount: number | null;
  amount_unit: string | null;
  tax_mode: string | null;
  quantity: number | null;
  extra_amount: number | null;
  extra_note: string | null;
  /** Cost lines taken from the confirmed order (#44); empty on older invoices */
  items?: unknown;
  note: string | null;
  party_name: string | null;
  speaker_name: string | null;
  status: InvoiceStatus;
  return_reason: string | null;
  revision: number;
  issued_at: string;
  responded_at: string | null;
  due_date: string | null;
  bank_info: BankInfo | null;
  registration_no: string | null;
  receipts: Receipt[] | null;
};

/** The extra details sent with an invoice (migration 184). */
export type InvoiceDetails = { dueDate: string | null; bank: BankInfo | null; registrationNo: string | null; receipts: Receipt[]; /** order cost rows (0-based) left off the invoice, migration 186 */ skipItems?: number[] };

export const INVOICE_STATUS_TEXT: Record<InvoiceStatus, string> = {
  submitted: "提出済み（確認待ち）",
  confirmed: "確認済み（支払い待ち）",
  returned: "差し戻し（修正してください）",
  paid: "支払い済み",
};

const ERRORS: Record<string, string> = {
  not_decided: "講師が決定してから提出できます。",
  not_editable: "すでに確認・支払い済みのため変更できません。",
  not_found: "対象が見つかりません。",
  too_long: "文字数が多すぎます。",
  no_amount: "金額が決まっていません。企業が注文書を発行し、講師が確認してから提出してください。",
  bad_date: "支払期限は今日から2年以内の日付にしてください。",
  bad_reg_no: "登録番号は「T」と13桁の数字で入力してください。",
  bad_bank: "振込先の入力内容を確認してください。",
  bad_receipts: "領収書の添付内容を確認してください。",
  bad_items: "注文書の費用項目の選択を確認してください。",
};

function message(raw: string) {
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : "処理できませんでした。";
}

function db() {
  return createClient() as unknown as SupabaseClient;
}

export async function getInvoiceForResponse(responseId: string): Promise<InvoiceRow | null> {
  const { data } = await db().from("request_invoices").select("*").eq("response_id", responseId).maybeSingle();
  return (data as InvoiceRow | null) ?? null;
}

export async function getInvoice(invoiceId: string): Promise<InvoiceRow | null> {
  const { data } = await db().from("request_invoices").select("*").eq("invoice_id", invoiceId).maybeSingle();
  return (data as InvoiceRow | null) ?? null;
}

export async function submitInvoice(responseId: string, extra: number | null, extraNote: string | null, note: string | null, quantity: number | null, details: InvoiceDetails) {
  const args = {
    p_response_id: responseId,
    p_extra: extra,
    p_extra_note: extraNote,
    p_note: note,
    p_quantity: quantity,
    p_due_date: details.dueDate,
    p_bank: details.bank,
    p_registration_no: details.registrationNo,
    p_receipts: details.receipts,
  };
  // The 10th argument is sent only when a row is left off, so ordinary submits keep working before migration 186 is run.
  const skip = details.skipItems ?? [];
  const { data, error } = await db().rpc("submit_invoice", skip.length > 0 ? { ...args, p_skip_items: skip } : args);
  return { invoiceId: (data as string | null) ?? null, error: error ? { message: message(error.message) } : null };
}

/** Older versions of an invoice (saved at each re-submit), oldest first. */
export async function getInvoiceChanges(invoiceId: string): Promise<InvoiceRow[]> {
  const { data } = await db().from("request_invoice_changes").select("revision, snapshot").eq("invoice_id", invoiceId).order("revision", { ascending: true });
  return ((data as { snapshot: InvoiceRow }[] | null) ?? []).map((r) => r.snapshot);
}

/** The 振込先 and 登録番号 of this lecturer's most recent earlier invoice (to pre-fill the form). */
export async function getLastInvoiceDetails(instructorId: string, exceptResponseId: string): Promise<{ bank: BankInfo | null; registrationNo: string | null }> {
  const { data } = await db()
    .from("request_invoices")
    .select("bank_info, registration_no")
    .eq("instructor_id", instructorId)
    .neq("response_id", exceptResponseId)
    .order("issued_at", { ascending: false })
    .limit(10);
  const rows = (data as { bank_info: unknown; registration_no: string | null }[] | null) ?? [];
  const bank = rows.map((r) => normalizeBank(r.bank_info)).find((b) => b) ?? null;
  const reg = rows.find((r) => r.registration_no)?.registration_no ?? null;
  return { bank, registrationNo: reg };
}

/** Uploads one 領収書 file to the private bucket (through the app server). */
export async function uploadReceipt(responseId: string, file: File): Promise<{ receipt: Receipt | null; error: string | null }> {
  const body = new FormData();
  body.append("responseId", responseId);
  body.append("file", file);
  try {
    const res = await fetch("/api/requests/receipts", { method: "POST", body });
    const json = (await res.json().catch(() => null)) as (Receipt & { message?: string; error?: string }) | null;
    if (!res.ok || !json) return { receipt: null, error: json?.message ?? "アップロードできませんでした。" };
    return { receipt: normalizeReceipts([json])[0] ?? null, error: null };
  } catch {
    return { receipt: null, error: "アップロードできませんでした。" };
  }
}

export function receiptHref(invoiceId: string, path: string): string {
  return `/api/requests/receipts?invoiceId=${encodeURIComponent(invoiceId)}&path=${encodeURIComponent(path)}`;
}

export async function respondInvoice(invoiceId: string, action: "confirm" | "return" | "paid", reason: string | null) {
  const { error } = await db().rpc("respond_invoice", { p_invoice_id: invoiceId, p_action: action, p_reason: reason });
  return { error: error ? { message: message(error.message) } : null };
}

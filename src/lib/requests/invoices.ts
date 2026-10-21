import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

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
  extra_amount: number | null;
  extra_note: string | null;
  note: string | null;
  status: InvoiceStatus;
  return_reason: string | null;
  revision: number;
  issued_at: string;
  responded_at: string | null;
};

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

export async function submitInvoice(responseId: string, extra: number | null, extraNote: string | null, note: string | null) {
  const { data, error } = await db().rpc("submit_invoice", { p_response_id: responseId, p_extra: extra, p_extra_note: extraNote, p_note: note });
  return { invoiceId: (data as string | null) ?? null, error: error ? { message: message(error.message) } : null };
}

export async function respondInvoice(invoiceId: string, action: "confirm" | "return" | "paid", reason: string | null) {
  const { error } = await db().rpc("respond_invoice", { p_invoice_id: invoiceId, p_action: action, p_reason: reason });
  return { error: error ? { message: message(error.message) } : null };
}

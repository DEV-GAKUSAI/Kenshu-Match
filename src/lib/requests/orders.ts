import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { OrderItem } from "@/lib/requests/order-calc";

// 発注管理・注文書 (#51). The rules are in the database (migration 157).

export type OrderStatus = "issued" | "confirmed" | "declined";

export type OrderRow = {
  order_id: string;
  request_id: string;
  response_id: string;
  requester_id: string;
  instructor_id: string;
  order_no: string;
  title: string;
  schedule_text: string | null;
  amount: number | null;
  amount_unit: string | null;
  tax_mode: string | null;
  transport_cost: string | null;
  lodging_cost: string | null;
  prep_cost: string | null;
  payment_terms: string | null;
  note: string | null;
  /** 数量 of the 登壇料 line (hours / days); null for a 総額 price or before migration 182 */
  /** why the lecturer declined (migration 183) */
  decline_reason?: string | null;
  main_qty?: number | null;
  /** extra 明細 lines (migration 182) */
  items?: unknown;
  party_name: string | null;
  speaker_name: string | null;
  status: OrderStatus;
  revision: number;
  issued_at: string;
  responded_at: string | null;
};

export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = { issued: "発行済み（確認待ち）", confirmed: "確認済み", declined: "辞退" };

const ERRORS: Record<string, string> = {
  not_decided: "講師が決定してから発行できます。",
  already_confirmed: "講師が確認済みのため、変更できません。",
  not_editable: "すでに回答済みです。",
  not_found: "対象が見つかりません。",
  too_long: "文字数が多すぎます。",
  reason_required: "辞退の理由を入力してください。",
  bad_items: "明細の内容を確認してください（品目は50文字まで、数量は1以上、単価は0〜10,000,000円）。",
};

function message(raw: string) {
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : "処理できませんでした。";
}

function db() {
  return createClient() as unknown as SupabaseClient;
}

export async function getOrderForResponse(responseId: string): Promise<OrderRow | null> {
  const { data } = await db().from("request_orders").select("*").eq("response_id", responseId).maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export async function getOrder(orderId: string): Promise<OrderRow | null> {
  const { data } = await db().from("request_orders").select("*").eq("order_id", orderId).maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export async function issueOrder(responseId: string, paymentTerms: string | null, note: string | null, mainQty: number | null = null, items: OrderItem[] = []) {
  // Needs migration 182 (the 5-argument issue_order).
  const { data, error } = await db().rpc("issue_order", { p_response_id: responseId, p_payment_terms: paymentTerms, p_note: note, p_main_qty: mainQty, p_items: items });
  return { orderId: (data as string | null) ?? null, error: error ? { message: message(error.message) } : null };
}

/** Older versions of an order (the snapshots saved at each re-issue), oldest first. */
export async function getOrderChanges(orderId: string): Promise<OrderRow[]> {
  const { data } = await db().from("request_order_changes").select("revision, snapshot").eq("order_id", orderId).order("revision", { ascending: true });
  return ((data as { snapshot: OrderRow }[] | null) ?? []).map((r) => r.snapshot);
}

/** What the order form starts with: the request's 支払条件 and the unit of the decided price. */
export async function getOrderDefaults(responseId: string): Promise<{ paymentTerms: string | null; unit: string | null; amount: number | null }> {
  const { data } = await db()
    .from("instructor_responses")
    .select("quote_price, quote_unit, training_requests(payment_terms, budget, budget_unit)")
    .eq("response_id", responseId)
    .maybeSingle();
  const row = data as { quote_price: number | null; quote_unit: string | null; training_requests: { payment_terms: string | null; budget: number | null; budget_unit: string | null } | { payment_terms: string | null; budget: number | null; budget_unit: string | null }[] | null } | null;
  const req = Array.isArray(row?.training_requests) ? row?.training_requests[0] : row?.training_requests;
  return { paymentTerms: req?.payment_terms ?? null, unit: row?.quote_unit ?? req?.budget_unit ?? null, amount: row?.quote_price ?? req?.budget ?? null };
}

export async function respondOrder(orderId: string, accept: boolean, reason: string | null = null) {
  // Needs migration 183 (the 3-argument respond_order, a decline needs a reason).
  const { error } = await db().rpc("respond_order", { p_order_id: orderId, p_accept: accept, p_reason: reason });
  return { error: error ? { message: message(error.message) } : null };
}

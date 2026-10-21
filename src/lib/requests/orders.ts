import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

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

export async function issueOrder(responseId: string, paymentTerms: string | null, note: string | null) {
  const { data, error } = await db().rpc("issue_order", { p_response_id: responseId, p_payment_terms: paymentTerms, p_note: note });
  return { orderId: (data as string | null) ?? null, error: error ? { message: message(error.message) } : null };
}

export async function respondOrder(orderId: string, accept: boolean) {
  const { error } = await db().rpc("respond_order", { p_order_id: orderId, p_accept: accept });
  return { error: error ? { message: message(error.message) } : null };
}

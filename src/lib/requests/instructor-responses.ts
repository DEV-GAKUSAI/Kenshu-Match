import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { ResponseAction } from "@/types/database";

export async function submitInstructorResponse(
  requestId: string,
  instructorId: string,
  action: ResponseAction,
  extra?: {
    quote_price?: number | null;
    quote_tax_mode?: "included" | "excluded" | null;
    message?: string | null;
    apply_all_days?: "all" | "partial" | "none" | null;
    apply_role?: string | null;
    apply_experience?: string | null;
    apply_materials?: "existing" | "create" | "either" | null;
    apply_prep?: "yes" | "no" | "discuss" | null;
  }
) {
  const supabase = createClient();
  const { error } = await supabase.from("instructor_responses").insert({
    request_id: requestId,
    instructor_id: instructorId,
    action,
    quote_price: extra?.quote_price ?? null,
    quote_tax_mode: extra?.quote_price ? (extra?.quote_tax_mode ?? null) : null,
    message: extra?.message ?? null,
    apply_all_days: extra?.apply_all_days ?? null,
    apply_role: extra?.apply_role ?? null,
    apply_experience: extra?.apply_experience ?? null,
    apply_materials: extra?.apply_materials ?? null,
    apply_prep: extra?.apply_prep ?? null,
  });
  return { error: error && error.message.includes("deadline_passed") ? { ...error, message: "応募の締切を過ぎています。" } : error };
}

export async function markResultsSeenByInstructor(responseIds: string[]) {
  if (!responseIds.length) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("instructor_responses")
    .update({ result_seen_at: new Date().toISOString() })
    .in("response_id", responseIds)
    .is("result_seen_at", null);
  if (error) console.error("markResultsSeenByInstructor error:", error);
}

export async function markResponsesSeenByRequester(responseIds: string[]) {
  if (!responseIds.length) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("instructor_responses")
    .update({ requester_seen_at: new Date().toISOString() })
    .in("response_id", responseIds)
    .is("requester_seen_at", null);
  if (error) console.error("markResponsesSeenByRequester error:", error);
}

/** Unseen "not selected" broadcast-result badge count, shown on mypage. */
export async function countUnseenNotSelectedResults(instructorId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_requests")
    .select("request_id, instructor_responses!inner(instructor_id, is_selected, result_seen_at)")
    .is("target_instructor_id", null)
    .eq("status", "accepted")
    .eq("instructor_responses.instructor_id", instructorId)
    .eq("instructor_responses.is_selected", false)
    .is("instructor_responses.result_seen_at", null);
  if (error || !data) return 0;
  return data.length;
}

/** Company: ask an applicant (公募依頼) for an interview before choosing. */
export async function requestInterview(responseId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("request_interview", { p_response_id: responseId });
  return { error };
}

/** Instructor: agree to the interview and hand the full name to the company. */
export async function releaseInstructorName(responseId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("release_instructor_name", { p_response_id: responseId });
  return { error };
}

/** Instructor: decline the interview request. */
export async function declineInterview(responseId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("decline_interview", { p_response_id: responseId });
  return { error };
}

const REVISE_ERRORS: Record<string, string> = {
  not_editable: "すでに確定または受付終了のため、変更できません。",
  not_found: "対象の応募が見つかりません。",
  deadline_passed: "応募の締切を過ぎています。",
  not_reapplicable: "すでに確定または受付終了のため、再度応募できません。",
  bad_apply: "応募内容の入力を確認してください。",
  bad_price: "見積り金額は1円以上の整数で入力してください。",
  bad_message: "メッセージが長すぎます。",
};

function reviseMessage(raw: string): string {
  const key = Object.keys(REVISE_ERRORS).find((k) => raw.includes(k));
  return key ? REVISE_ERRORS[key] : "処理できませんでした。";
}

/** 見積りの変更（確定前のみ）: price, tax and message. The company sees it as NEW with a history row. */
export async function reviseQuote(responseId: string, price: number, tax: "included" | "excluded" | null, message: string | null) {
  const supabase = createClient() as unknown as SupabaseClient;
  const { error } = await supabase.rpc("revise_instructor_quote", { p_response_id: responseId, p_price: price, p_tax: tax, p_message: message });
  return { error: error ? { message: reviseMessage(error.message) } : null };
}

/** 応募の取り下げ（確定前のみ）. */
export async function withdrawResponse(responseId: string) {
  const supabase = createClient() as unknown as SupabaseClient;
  const { error } = await supabase.rpc("withdraw_instructor_response", { p_response_id: responseId });
  return { error: error ? { message: reviseMessage(error.message) } : null };
}

/** 再度応募する（取り下げ後・確定前のみ）. */
export async function reapplyResponse(
  responseId: string,
  v: {
    price: number | null;
    tax: "included" | "excluded" | null;
    message: string | null;
    apply_all_days: string | null;
    apply_role: string | null;
    apply_experience: string | null;
    apply_materials: string | null;
    apply_prep?: string | null;
  },
) {
  const supabase = createClient() as unknown as SupabaseClient;
  const { error } = await supabase.rpc("reapply_instructor_response", {
    p_response_id: responseId,
    p_price: v.price,
    p_tax: v.price ? v.tax : null,
    p_message: v.message,
    p_all_days: v.apply_all_days,
    p_role: v.apply_role,
    p_experience: v.apply_experience,
    p_materials: v.apply_materials,
    p_prep: v.apply_prep ?? null,
  });
  return { error: error ? { message: reviseMessage(error.message) } : null };
}

export type ResponseChange = { change_id: string; kind: "revised" | "withdrawn" | "reapplied"; old_price: number | null; new_price: number | null; created_at: string };

export async function getResponseChanges(responseId: string): Promise<ResponseChange[]> {
  const supabase = createClient() as unknown as SupabaseClient;
  const { data } = await supabase
    .from("instructor_response_changes")
    .select("change_id, kind, old_price, new_price, created_at")
    .eq("response_id", responseId)
    .order("created_at", { ascending: false });
  return (data as unknown as ResponseChange[] | null) ?? [];
}

/** Company: set the selection stage of an applicant (書類確認 / 条件調整 / 見送り; null = 応募). */
export async function setResponseStage(responseId: string, stage: "screening" | "negotiation" | "passed" | null) {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_response_stage", { p_response_id: responseId, p_stage: stage });
  return { error };
}

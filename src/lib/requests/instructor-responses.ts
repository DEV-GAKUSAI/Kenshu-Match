import { createClient } from "@/lib/supabase/client";
import type { ResponseAction } from "@/types/database";

export async function submitInstructorResponse(
  requestId: string,
  instructorId: string,
  action: ResponseAction,
  extra?: { quote_price?: number | null; quote_tax_mode?: "included" | "excluded" | null; message?: string | null }
) {
  const supabase = createClient();
  const { error } = await supabase.from("instructor_responses").insert({
    request_id: requestId,
    instructor_id: instructorId,
    action,
    quote_price: extra?.quote_price ?? null,
    quote_tax_mode: extra?.quote_price ? (extra?.quote_tax_mode ?? null) : null,
    message: extra?.message ?? null,
  });
  return { error };
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

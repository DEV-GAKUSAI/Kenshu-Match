import { createClient } from "@/lib/supabase/client";
import type { RequestFormat, RequesterType } from "@/types/database";

export interface NewTrainingRequestInput {
  requester_id: string;
  requester_type: RequesterType;
  title: string;
  description: string;
  expertise_field: string;
  budget: number | null;
  participant_count: number | null;
  preferred_format: RequestFormat;
  location: string | null;
  preferred_schedule: string | null;
  target_instructor_id: string | null;
}

export async function createTrainingRequest(input: NewTrainingRequestInput) {
  const supabase = createClient();
  const { error } = await supabase.from("training_requests").insert(input);
  return { error };
}

/** Unauthenticated / non-instructor preview list (open_requests_public_preview view). */
export async function getOpenRequestsPublicPreview() {
  const supabase = createClient();
  return supabase.from("open_requests_public_preview").select("*").order("created_at", { ascending: false });
}

export async function getOpenRequestPublicDetail(requestId: string) {
  const supabase = createClient();
  return supabase.from("open_requests_public_preview").select("*").eq("request_id", requestId).maybeSingle();
}

/** Broadcast (target_instructor_id IS NULL) requests open for an instructor to respond to. */
export async function getOpenRequestsForInstructor() {
  const supabase = createClient();
  return supabase
    .from("training_requests")
    .select("*, instructor_responses(*)")
    .is("target_instructor_id", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
}

export async function getTrainingRequestDetail(requestId: string) {
  const supabase = createClient();
  return supabase
    .from("training_requests")
    .select("*, instructor_responses(*)")
    .eq("request_id", requestId)
    .maybeSingle();
}

export async function getTrainingRequestWithResponses(requestId: string) {
  const supabase = createClient();
  return supabase
    .from("training_requests")
    .select("*, instructor_responses(*)")
    .eq("request_id", requestId)
    .maybeSingle();
}

/** Requests directed at a specific instructor (mypage instructor view). */
export async function getRequestsForInstructor(instructorId: string) {
  const supabase = createClient();
  return supabase
    .from("training_requests")
    .select("*, instructor_responses(*)")
    .eq("target_instructor_id", instructorId)
    .order("created_at", { ascending: false });
}

/** Requests posted by a specific requester (mypage requester view). */
export async function getRequestsForRequester(requesterId: string) {
  const supabase = createClient();
  return supabase
    .from("training_requests")
    .select("*, instructor_responses(*)")
    .eq("requester_id", requesterId)
    .order("created_at", { ascending: false });
}

export async function cancelRequest(requestId: string, reason: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("training_requests")
    .update({ status: "cancelled", cancel_reason: reason, cancelled_at: new Date().toISOString() })
    .eq("request_id", requestId);
  return { error };
}

export async function completeRequest(requestId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("training_requests").update({ status: "completed" }).eq("request_id", requestId);
  return { error };
}

import { createClient } from "@/lib/supabase/client";
import type { Visibility } from "@/lib/requests/visibility";
import type { PublishState, RequestFormat, RequesterType } from "@/types/database";
import type { RoleSlot } from "@/lib/requests/roles";
import type { ScheduleDay } from "@/lib/requests/schedule";
import type { BudgetUnit, CostShare, PrepCost, TaxMode } from "@/lib/requests/money";

export interface NewTrainingRequestInput {
  requester_id: string;
  requester_type: RequesterType;
  title: string;
  description: string;
  expertise_field: string;
  budget: number | null;
  budget_unit: BudgetUnit;
  tax_mode: TaxMode;
  transport_cost: CostShare;
  lodging_cost: CostShare;
  prep_cost: PrepCost;
  payment_terms: string | null;
  schedule_days: ScheduleDay[];
  all_days_required: boolean;
  req_skills: string | null;
  req_prep: string | null;
  detail_option_ids?: string[];
  detail_other_tools?: string | null;
  publish_state?: PublishState;
  /** Only sent when not the default, so posting keeps working before migration 174 is run. */
  visibility?: Visibility;
  role_slots?: RoleSlot[];
  participant_count: number | null;
  preferred_format: RequestFormat;
  location: string | null;
  preferred_schedule: string | null;
  target_instructor_id: string | null;
}

/** Company: save as draft, publish a draft, pause or resume an open request. */
export async function setPublishState(requestId: string, state: PublishState) {
  const supabase = createClient();
  const { error } = await supabase.from("training_requests").update({ publish_state: state }).eq("request_id", requestId);
  return { error };
}

export async function createTrainingRequest(input: NewTrainingRequestInput) {
  const supabase = createClient();
  const { data, error } = await supabase.from("training_requests").insert(input).select("request_id").maybeSingle();
  return { error, requestId: (data as { request_id: string } | null)?.request_id ?? null };
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

/**
 * Requests for the instructor's mypage: the ones directed at them, plus the 公募
 * requests they have replied to (so the interview banner and the result show up).
 */
export async function getRequestsForInstructor(instructorId: string) {
  const supabase = createClient();
  const [directed, replied] = await Promise.all([
    supabase
      .from("training_requests")
      .select("*, instructor_responses(*)")
      .eq("target_instructor_id", instructorId)
      .order("created_at", { ascending: false }),
    supabase
      .from("training_requests")
      .select("*, instructor_responses!inner(*)")
      .is("target_instructor_id", null)
      .eq("instructor_responses.instructor_id", instructorId)
      .order("created_at", { ascending: false }),
  ]);
  if (directed.error) return { data: null, error: directed.error };
  if (replied.error) return { data: null, error: replied.error };
  const seen = new Set<string>();
  const data = [...(directed.data ?? []), ...(replied.data ?? [])]
    .filter((row) => {
      if (seen.has(row.request_id)) return false;
      seen.add(row.request_id);
      return true;
    })
    .sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
  return { data, error: null };
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

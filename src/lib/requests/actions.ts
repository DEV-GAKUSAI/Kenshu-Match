"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Finalizes a training request onto one instructor's response: marks the
 * response selected, accepts the request, and unlocks contact info between
 * the two parties. A Server Action (not a plain client-side lib function)
 * because it's the one multi-table transactional write in this app, and RLS
 * alone has a real gap here: contact_unlocks_insert_owning_requester
 * (083_kenshu_match_baseline.sql) only checks that the caller owns the
 * request -- it never verifies that response_id/instructor_id actually
 * correspond to a real, eligible instructor_responses row for that request.
 * Running server-side lets us re-validate that linkage before any write
 * instead of trusting whatever the client passed in.
 *
 * The "correct" reference-project-style fix would be a SECURITY DEFINER
 * Postgres RPC (see save_company_opportunity/send_scout in
 * engineer-match-platform) wrapping all three writes in one DB transaction.
 * That needs a migration, which is out of scope for this refactor -- this
 * Server Action re-validates the same things an RPC would, but the three
 * writes below are still sequential, not atomic; a failure between them can
 * still leave partial state, same as the client-side version this replaces.
 */
export async function finalizeResponse(params: {
  requestId: string;
  responseId: string;
  instructorId: string;
}) {
  const { requestId, responseId, instructorId } = params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: { message: "ログインが必要です。" } };
  }

  const { data: response, error: responseError } = await supabase
    .from("instructor_responses")
    .select("response_id, request_id, instructor_id, action, is_selected, interview_status")
    .eq("response_id", responseId)
    .maybeSingle();

  if (responseError || !response) {
    return { error: { message: "対象の回答が見つかりません。" } };
  }
  if (response.request_id !== requestId || response.instructor_id !== instructorId) {
    return { error: { message: "回答と依頼の組み合わせが一致しません。" } };
  }
  if (response.action !== "accept" && response.action !== "quote") {
    return { error: { message: "この回答は選定できる状態ではありません。" } };
  }
  if (response.is_selected) {
    return { error: { message: "この回答はすでに確定済みです。" } };
  }

  const { data: request, error: requestError } = await supabase
    .from("training_requests")
    .select("request_id, requester_id, status, target_instructor_id")
    .eq("request_id", requestId)
    .maybeSingle();

  if (requestError || !request) {
    return { error: { message: "対象の依頼が見つかりません。" } };
  }
  if (request.requester_id !== user.id) {
    return { error: { message: "この依頼を確定する権限がありません。" } };
  }
  if (request.status !== "pending") {
    return { error: { message: "この依頼はすでに確定・キャンセル済みです。" } };
  }

  // 公募依頼: the instructor must have agreed to the interview and released the name first.
  if (!request.target_instructor_id && response.interview_status !== "released") {
    return { error: { message: "先に面談を依頼し、講師が情報を公開してから決定してください。" } };
  }

  const { error: e1 } = await supabase
    .from("instructor_responses")
    .update({ is_selected: true })
    .eq("response_id", responseId);
  if (e1) return { error: e1 };

  const { error: e2 } = await supabase
    .from("training_requests")
    .update({ status: "accepted" })
    .eq("request_id", requestId);
  if (e2) return { error: e2 };

  const { error: e3 } = await supabase
    .from("contact_unlocks")
    .insert({ request_id: requestId, response_id: responseId, requester_id: user.id, instructor_id: instructorId });
  if (e3) return { error: e3 };

  return { error: null };
}

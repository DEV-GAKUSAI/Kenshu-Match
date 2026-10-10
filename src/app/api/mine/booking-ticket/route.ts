import { NextRequest, NextResponse } from "next/server";

import { createBookingTicket, mineAppOrigin } from "@/lib/mine/booking";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" };

function fail(error: string, message: string, status: number) {
  return NextResponse.json({ error, message }, { status, headers: noStore });
}

/**
 * POST /api/mine/booking-ticket  { "responseId": "<uuid>" }
 *
 * The signed-in company (or individual) asks to book an interview with the
 * instructor who sent this reply. Checks that the request is theirs, the reply
 * is 承諾 / 見積り and the instructor came from Mine, then returns the Mine
 * booking URL with a signed, single-use ticket in the URL fragment.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return fail("forbidden", "不正なリクエストです。", 403);

  const secret = process.env.MINE_HANDOFF_SECRET;
  const admin = createAdminClient();
  if (!secret || secret.length < 32 || !admin) {
    return fail("unavailable", "現在、面談の予約は利用できません。", 503);
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("not_signed_in", "ログインしてください。", 401);

  const body = (await request.json().catch(() => null)) as { responseId?: unknown } | null;
  const responseId = typeof body?.responseId === "string" && UUID.test(body.responseId) ? body.responseId : null;
  if (!responseId) return fail("invalid_request", "リクエストが正しくありません。", 400);

  const { data: response } = await admin
    .from("instructor_responses")
    .select("response_id, request_id, instructor_id, action")
    .eq("response_id", responseId)
    .maybeSingle();
  if (!response) return fail("not_found", "返信が見つかりません。", 404);
  if (response.action !== "accept" && response.action !== "quote") {
    return fail("not_available", "この返信には面談を予約できません。", 409);
  }

  const { data: trainingRequest } = await admin
    .from("training_requests")
    .select("requester_id, status")
    .eq("request_id", response.request_id)
    .maybeSingle();
  if (!trainingRequest || trainingRequest.requester_id !== auth.user.id) {
    return fail("not_found", "返信が見つかりません。", 404);
  }
  if (trainingRequest.status === "cancelled" || trainingRequest.status === "completed") {
    return fail("not_available", "この依頼は終了しているため、面談を予約できません。", 409);
  }

  const { data: link } = await admin
    .from("mine_kenshu_account_links")
    .select("mine_user_id")
    .eq("kenshu_user_id", response.instructor_id)
    .maybeSingle();
  if (!link) return fail("not_linked", "この講師はオンラインでの面談予約に対応していません。", 409);

  const [{ data: user }, { data: profile }] = await Promise.all([
    admin.from("users").select("name").eq("id", auth.user.id).maybeSingle(),
    admin.from("requester_profiles").select("company_name").eq("id", auth.user.id).maybeSingle(),
  ]);
  const personName = (user?.name ?? "").trim();
  const org = (profile?.company_name ?? "").trim() || personName || "ケンシュウリンクの利用者";

  const ticket = createBookingTicket(
    { mineUserId: link.mine_user_id, org, name: personName, responseId },
    secret,
    Math.floor(Date.now() / 1000),
  );
  return NextResponse.json({ url: `${mineAppOrigin()}/book/kenshulink#t=${ticket}` }, { headers: noStore });
}

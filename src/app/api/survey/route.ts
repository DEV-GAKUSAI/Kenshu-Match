import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";
import { isSurveyToken, parseSubmission, type SurveyLinkState } from "@/lib/survey/answers";

export const dynamic = "force-dynamic";

/**
 * The participant side of 研修アンケート. No login: the one-time link is the
 * proof. Both calls go to database functions (migration 138) that check the
 * link; this route only passes the answers on and adds a short hash of the
 * network address so admin can look into an odd pattern later (the address
 * itself is not stored).
 */

function anonClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const noStore = { "Cache-Control": "no-store" };

/** GET /api/survey?t=<token>  ->  { state, title?, opens_at? } */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  if (!isSurveyToken(token)) return NextResponse.json({ state: "invalid" satisfies SurveyLinkState }, { headers: noStore });

  const { data, error } = await anonClient().rpc("get_training_survey_for_token", { p_token: token });
  if (error || !data) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  return NextResponse.json(data, { headers: noStore });
}

/** POST /api/survey  { token, answers: {q1..q5}, comment?, name? }  ->  { state } */
export async function POST(request: NextRequest) {
  const parsed = parseSubmission(await request.json().catch(() => null));
  if (!parsed) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: noStore });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const clientHash = ip ? createHash("sha256").update(`kenshu-survey:${ip}`).digest("hex").slice(0, 16) : null;

  const { data, error } = await anonClient().rpc("submit_training_survey_answer", {
    p_token: parsed.token,
    p_q1: parsed.scores.q1,
    p_q2: parsed.scores.q2,
    p_q3: parsed.scores.q3,
    p_q4: parsed.scores.q4,
    p_q5: parsed.scores.q5,
    p_comment: parsed.comment,
    p_name: parsed.name,
    p_client_hash: clientHash,
  });
  if (error || !data) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  return NextResponse.json(data, { headers: noStore });
}

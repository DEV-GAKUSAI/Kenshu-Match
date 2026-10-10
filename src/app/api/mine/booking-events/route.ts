import { NextRequest, NextResponse } from "next/server";

import { parseMeetingEvent, verifyMineMessage } from "@/lib/mine/booking";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/mine/booking-events — server-to-server from Mine only.
 * Signed with the shared MINE_HANDOFF_SECRET (X-Mine-Timestamp / X-Mine-Signature).
 * Body: the meeting's full current state. Saved into kenshu_mine_meetings
 * (newest version wins). Answers 200 for anything that should not be retried.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.MINE_HANDOFF_SECRET;
  const admin = createAdminClient();
  if (!secret || secret.length < 32 || !admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const raw = await request.text();
  if (raw.length > 8000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const ok = verifyMineMessage(
    raw,
    request.headers.get("x-mine-timestamp"),
    request.headers.get("x-mine-signature"),
    secret,
    Math.floor(Date.now() / 1000),
  );
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ result: "ignored_invalid" });
  }
  const event = parseMeetingEvent(parsed);
  if (!event) return NextResponse.json({ result: "ignored_invalid" });

  const { mine_user_id: mineUserId, ...payload } = event;
  const { data, error } = await admin.rpc("kenshu_mine_meeting_save", { p_mine_user_id: mineUserId, p_payload: payload });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ result: data });
}

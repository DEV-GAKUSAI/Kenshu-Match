import { NextResponse } from "next/server";

import { MAX_ATTEMPTS, buildNoticeBody, classifyStatus, retryDelayMinutes, signNotice } from "@/lib/mine/notices";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface ClaimedRow {
  id: number;
  event_id: string;
  mine_user_id: string;
  event_code: string;
  attempts: number;
  request_id: string | null;
}

/**
 * POST /api/mine/notice-flush -- sends queued notices to Mine's hub.
 * Safe for anyone to call: it only sends what is already queued (rows are
 * leased for 2 minutes, so parallel calls do not double-send) and the body
 * never contains names or text. Does nothing when the env keys are missing.
 */
export async function POST() {
  const base = process.env.MINE_APP_URL;
  const keyId = process.env.MINE_HUB_KEY_ID;
  const secret = process.env.MINE_HUB_SECRET;
  const admin = createAdminClient();
  if (!base || !keyId || !secret || secret.length < 32 || !admin) return NextResponse.json({ sent: 0, skipped: true });

  const { data, error } = await admin.rpc("kenshu_notice_claim", { p_limit: 20 });
  if (error || !Array.isArray(data)) return NextResponse.json({ sent: 0 });

  let sent = 0;
  for (const row of data as ClaimedRow[]) {
    const now = new Date();
    const body = buildNoticeBody(row, now);
    let outcome: "sent" | "drop" | "retry" = "drop";
    let errorText: string | null = null;
    if (body) {
      const timestamp = String(Math.floor(now.getTime() / 1000));
      try {
        const res = await fetch(`${base.replace(/\/$/, "")}/api/hub/v1/events`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-mine-hub-service": "kenshulink",
            "x-mine-hub-key-id": keyId,
            "x-mine-hub-timestamp": timestamp,
            "x-mine-hub-signature": signNotice(secret, timestamp, body),
          },
          body,
          signal: AbortSignal.timeout(8000),
        });
        outcome = classifyStatus(res.status);
        if (outcome !== "sent") errorText = `HTTP ${res.status}`;
      } catch {
        outcome = "retry";
        errorText = "network";
      }
    } else {
      errorText = "bad_code";
    }

    if (outcome === "sent") {
      sent += 1;
      await admin.from("mine_notice_outbox").update({ sent_at: now.toISOString(), error: null }).eq("id", row.id);
    } else if (outcome === "drop" || row.attempts >= MAX_ATTEMPTS) {
      await admin.from("mine_notice_outbox").update({ sent_at: now.toISOString(), error: `dropped: ${errorText}` }).eq("id", row.id);
    } else {
      const next = new Date(now.getTime() + retryDelayMinutes(row.attempts) * 60_000).toISOString();
      await admin.from("mine_notice_outbox").update({ next_at: next, error: errorText }).eq("id", row.id);
    }
  }

  // Housekeeping: forget sent rows after 7 days.
  await admin
    .from("mine_notice_outbox")
    .delete()
    .not("sent_at", "is", null)
    .lt("sent_at", new Date(Date.now() - 7 * 86_400_000).toISOString());

  return NextResponse.json({ sent });
}

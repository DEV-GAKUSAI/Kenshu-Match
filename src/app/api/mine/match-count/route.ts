import { NextRequest, NextResponse } from "next/server";

import { countMatchingOpenRequests, isAuthorizedMatchCountRequest, isMineUserId } from "@/lib/mine/match-count";
import { createSupabaseMineStore } from "@/lib/mine/supabase-store";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/mine/match-count  { "mineUserId": "<uuid>" }
 *
 * Server-to-server only (called by Mine's server, never by a browser).
 * Protected by the shared secret KENSHU_LINK_MATCH_COUNT_SECRET, sent as
 * "Authorization: Bearer <secret>". Returns only { count }: the number of open
 * training requests the linked instructor can browse and answer that match
 * their expertise fields. Unknown or unlinked people get { count: 0 }.
 */
export async function POST(request: NextRequest) {
  if (!process.env.KENSHU_LINK_MATCH_COUNT_SECRET) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!isAuthorizedMatchCountRequest(request.headers.get("authorization"), process.env.KENSHU_LINK_MATCH_COUNT_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { mineUserId?: unknown } | null;
  if (!body || !isMineUserId(body.mineUserId)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  try {
    const count = await countMatchingOpenRequests(createSupabaseMineStore(admin), body.mineUserId);
    return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

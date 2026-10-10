import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/mine/booking-availability  { "instructorIds": ["<uuid>", …] }
 * Which of these instructors came from Mine (so 「面談を予約」 can be shown).
 * Signed-in users only; returns ids only.
 */
export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  if (!admin || !process.env.MINE_HANDOFF_SECRET) return NextResponse.json({ linked: [] });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ linked: [] }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { instructorIds?: unknown } | null;
  const ids = Array.isArray(body?.instructorIds)
    ? [...new Set(body.instructorIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))].slice(0, 100)
    : [];
  if (ids.length === 0) return NextResponse.json({ linked: [] });

  const { data } = await admin.from("mine_kenshu_account_links").select("kenshu_user_id").in("kenshu_user_id", ids);
  return NextResponse.json(
    { linked: (data ?? []).map((row: { kenshu_user_id: string }) => row.kenshu_user_id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

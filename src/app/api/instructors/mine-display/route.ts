import { NextRequest, NextResponse } from "next/server";

import { toDisplay, type MineDisplayMap } from "@/lib/mine/display";
import { initialsFromName, type MinePublicProfile } from "@/lib/mine/public-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 200;

/**
 * POST /api/instructors/mine-display  { "ids": ["<instructor id>", ...] }
 *
 * For lists and cards: for each publicly listed instructor, their initials
 * plus the little they allowed in Mine (自己紹介, 希望条件). One call for the
 * whole page. Unknown or unlisted ids are left out. The full name is only used
 * to make fallback initials and is never sent back.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string" && UUID_RE.test(id)) : [];
  if (!ids.length || ids.length > MAX_IDS) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: listed, error: listError } = await admin.from("instructor_public_directory").select("id, name").in("id", ids);
  if (listError) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: profiles, error } = await admin.rpc("mine_public_profiles_for_kenshu", { p_kenshu_user_ids: (listed ?? []).map((row) => row.id as string) });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const byId = (profiles ?? {}) as Record<string, MinePublicProfile>;

  const items: MineDisplayMap = {};
  for (const row of listed ?? []) {
    const profile = byId[row.id as string];
    items[row.id as string] = toDisplay(profile?.initials || initialsFromName(row.name as string | null), profile);
  }
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

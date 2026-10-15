import { NextRequest, NextResponse } from "next/server";

import { initialsFromName, type MinePublicProfile } from "@/lib/mine/public-profile";
import { signPhotoUrls } from "@/lib/mine/photo";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/instructors/<instructor id>/mine-profile
 *
 * What the instructor allowed Kenshu Link to show from their Mine profile,
 * plus their initials. Only for instructors listed publicly (they appear in
 * instructor_public_directory). Mine's function runs with the service role,
 * returns nothing when the user is not linked or turned 公開プロフィール off,
 * and never contains the user's name or contact details. Company names appear only inside 職歴, which the user can switch off. The full name is
 * only used to make fallback initials; it is not sent to the browser.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: listed } = await admin.from("instructor_public_directory").select("id, name").eq("id", id).maybeSingle();
  if (!listed) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await admin.rpc("mine_public_profile_for_kenshu", { p_kenshu_user_id: id });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const profile = (data ?? null) as MinePublicProfile | null;
  // Mine photos are private: only a person who switched 写真 on has avatar_path,
  // and it becomes a link that works for an hour. The path itself is not sent.
  const photoUrl = profile?.avatar_path ? (await signPhotoUrls(admin, { [id]: profile.avatar_path }))[id] : undefined;
  if (profile) delete profile.avatar_path;
  return NextResponse.json(
    { initials: profile?.initials || initialsFromName(listed.name), profile, photoUrl: photoUrl ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

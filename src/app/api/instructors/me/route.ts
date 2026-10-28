import { NextResponse } from "next/server";

import { mineAppOrigin } from "@/lib/mine/booking";
import { initialsFromName, type MinePublicProfile } from "@/lib/mine/public-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/instructors/me
 *
 * For the instructor's own マイページ card: whether this account is linked to
 * Mine, and (when the instructor switched their public profile on in Mine) the
 * little Mine lets Kenshu Link show: initials, area, rate, work style. Also the
 * address of Mine's サービス page for the 「Mineで編集する」 button.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "not_signed_in" }, { status: 401, headers: noStore });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });

  const { data: link } = await admin.from("mine_kenshu_account_links").select("mine_user_id").eq("kenshu_user_id", auth.user.id).maybeSingle();
  if (!link) return NextResponse.json({ linked: false }, { headers: noStore });

  const { data: profiles } = await admin.rpc("mine_public_profiles_for_kenshu", { p_kenshu_user_ids: [auth.user.id] });
  const profile = ((profiles ?? {}) as Record<string, MinePublicProfile>)[auth.user.id];
  const conditions = profile?.training_conditions;
  // Initials come from Mine when public; otherwise from the account name (never sent back in full).
  const { data: userRow } = await admin.from("users").select("name").eq("id", auth.user.id).maybeSingle();
  return NextResponse.json(
    {
      linked: true,
      public: !!profile,
      // The same public profile companies see (only what the instructor allowed in Mine).
      profile: profile ?? null,
      initials: profile?.initials || initialsFromName((userRow?.name as string | null) ?? null) || null,
      prefectures: conditions?.prefectures ?? [],
      hourly_rate: typeof conditions?.hourly_rate_min === "number" ? conditions.hourly_rate_min : null,
      work_style: conditions?.work_style ?? null,
      training_skills: conditions?.training_skills ?? [],
      mine_url: `${mineAppOrigin()}/apps`,
    },
    { headers: noStore },
  );
}

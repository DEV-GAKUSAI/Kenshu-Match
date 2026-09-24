import { createHash } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { verifyMineHandoffToken } from "@/lib/auth/mine-handoff";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseEnv } from "@/lib/supabase/env";

function failed(request: NextRequest) {
  return NextResponse.redirect(new URL("/login?error=mine_handoff", request.url));
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const admin = createAdminClient();
  if (!token || !admin) return failed(request);

  try {
    const handoff = verifyMineHandoffToken(token);
    const tokenDigest = createHash("sha256").update(handoff.nonce).digest("hex");
    const { error: nonceError } = await admin.from("mine_kenshu_sso_nonces").insert({
      token_digest: tokenDigest,
      expires_at: new Date(handoff.exp * 1000).toISOString(),
    });
    if (nonceError) return failed(request);

    const { data: existingLink, error: linkReadError } = await admin
      .from("mine_kenshu_account_links")
      .select("kenshu_user_id")
      .eq("mine_user_id", handoff.sub)
      .maybeSingle();
    if (linkReadError) return failed(request);

    let kenshuUserId = existingLink?.kenshu_user_id as string | undefined;
    const internalEmail = `mine-${handoff.sub}@sso.mine.local`;

    if (!kenshuUserId) {
      const { data: existingInternalUser } = await admin
        .from("users")
        .select("id, role")
        .eq("email", internalEmail)
        .maybeSingle();

      if (existingInternalUser?.role === "INSTRUCTOR") {
        kenshuUserId = existingInternalUser.id;
      } else {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: internalEmail,
          email_confirm: true,
          user_metadata: {
            role: "INSTRUCTOR",
            name: handoff.name.trim().slice(0, 50),
            mine_user_id: handoff.sub,
          },
        });
        if (createError || !created.user) return failed(request);
        kenshuUserId = created.user.id;
      }

      const { error: linkWriteError } = await admin
        .from("mine_kenshu_account_links")
        .insert({
          mine_user_id: handoff.sub,
          kenshu_user_id: kenshuUserId,
          mine_email: handoff.email.toLowerCase(),
        });
      if (linkWriteError) return failed(request);
    }

    if (!kenshuUserId) return failed(request);

    const { data: account, error: accountError } = await admin
      .from("users")
      .select("role")
      .eq("id", kenshuUserId)
      .maybeSingle();
    if (accountError || account?.role !== "INSTRUCTOR") return failed(request);

    await admin
      .from("users")
      .update({ name: handoff.name.trim().slice(0, 50) })
      .eq("id", kenshuUserId);
    await admin.from("instructor_profiles").upsert(
      { id: kenshuUserId, contact_email: handoff.email.toLowerCase() },
      { onConflict: "id" },
    );

    const { data: authUser, error: authUserError } =
      await admin.auth.admin.getUserById(kenshuUserId);
    if (authUserError || !authUser.user?.email) return failed(request);

    const { data: linkResult, error: magicLinkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: authUser.user.email,
      });
    const hashedToken = linkResult?.properties?.hashed_token;
    if (magicLinkError || !hashedToken) return failed(request);

    const response = NextResponse.redirect(new URL(handoff.returnPath, request.url));
    const { url, anonKey } = getSupabaseEnv();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          ),
      },
    });
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: hashedToken,
    });
    if (verifyError) return failed(request);
    return response;
  } catch {
    return failed(request);
  }
}

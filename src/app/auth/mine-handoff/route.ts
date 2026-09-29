import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { verifyMineHandoffToken } from "@/lib/auth/mine-handoff";
import { runMineHandoff } from "@/lib/mine/handoff-service";
import { createSupabaseMineStore } from "@/lib/mine/supabase-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseEnv } from "@/lib/supabase/env";

function failed(request: NextRequest, reason: string) {
  // Reason codes only: never log tokens, emails or names.
  console.error(`[mine-handoff] failed: ${reason}`);
  return NextResponse.redirect(new URL("/login?error=mine_handoff", request.url));
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const admin = createAdminClient();
  if (!token) return failed(request, "missing_token");
  if (!admin) return failed(request, "server_not_configured");

  try {
    const handoff = verifyMineHandoffToken(token);
    const result = await runMineHandoff(createSupabaseMineStore(admin), handoff);
    if (!result.ok) return failed(request, result.reason);
    if (result.sync === "failed") console.error("[mine-handoff] skill sync failed; signing in anyway");

    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(result.kenshuUserId);
    if (authUserError || !authUser.user?.email) return failed(request, "auth_user_missing");

    const { data: linkResult, error: magicLinkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email,
    });
    const hashedToken = linkResult?.properties?.hashed_token;
    if (magicLinkError || !hashedToken) return failed(request, "magiclink_failed");

    const response = NextResponse.redirect(new URL(handoff.returnPath, request.url));
    const { url, anonKey } = getSupabaseEnv();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    });
    const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: hashedToken });
    if (verifyError) return failed(request, "verify_failed");
    return response;
  } catch (error) {
    return failed(request, error instanceof Error && error.message.startsWith("invalid_") ? error.message : "exception");
  }
}

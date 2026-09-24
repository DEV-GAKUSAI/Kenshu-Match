import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database, UserRole } from "@/types/database";
import { getSupabaseEnv } from "./env";

/**
 * Role(s) allowed to access a given pathname, keyed by top-level route
 * prefix. `roles: undefined` means "any authenticated user" — used for
 * /mypage, which renders an INSTRUCTOR view or a COMPANY/INDIVIDUAL
 * (requester) view internally based on the signed-in user's role, rather
 * than being gated to one role. /admin is gated to ADMIN only — Kenshu-Match's
 * own lightweight admin area (kept separate from engineer-match-platform's
 * admin panel, 2026-09-02 decision).
 */
const PROTECTED_PREFIXES: ReadonlyArray<{ prefix: string; roles?: UserRole[] }> = [
  { prefix: "/mypage" },
  { prefix: "/instructor-profile-edit", roles: ["INSTRUCTOR"] },
  { prefix: "/open-requests", roles: ["INSTRUCTOR"] },
  { prefix: "/requester-profile-edit", roles: ["COMPANY", "INDIVIDUAL"] },
  { prefix: "/post-request", roles: ["COMPANY", "INDIVIDUAL"] },
  { prefix: "/admin", roles: ["ADMIN"] },
];

function getRequiredRoles(pathname: string): UserRole[] | "any" | null {
  const match = PROTECTED_PREFIXES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!match) return null;
  return match.roles ?? "any";
}

/** /mypage renders both the instructor and requester dashboard views; there's nowhere else to send a mismatched role. ADMIN goes back to its own /admin area. */
function getDashboardPathForRole(role: UserRole): string {
  if (role === "ADMIN") return "/admin";
  return role === "INSTRUCTOR" || role === "COMPANY" || role === "INDIVIDUAL" ? "/mypage" : "/login";
}

/**
 * Refreshes the Supabase auth session on every request and keeps the
 * request/response cookies in sync. Called from src/proxy.ts (Next.js 16's
 * successor to middleware.ts) rather than a Server Component, because Server
 * Components cannot write cookies themselves.
 *
 * Uses supabase.auth.getUser(), not getSession() — getUser() revalidates the
 * token against Supabase Auth on every call instead of trusting whatever is
 * in the (possibly stale or tampered) cookie.
 *
 * Also enforces role-based route protection for /mypage,
 * /instructor-profile-edit, /requester-profile-edit, and /post-request: role
 * is re-read from public.users here (never trusted from client state).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const requiredRoles = getRequiredRoles(request.nextUrl.pathname);
  if (!requiredRoles) {
    return supabaseResponse;
  }

  // Redirects must carry over any refreshed session cookies from
  // supabaseResponse, or a token refresh that happened during getUser()
  // above would be silently dropped.
  function redirectTo(path: string) {
    const redirectResponse = NextResponse.redirect(new URL(path, request.url));
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  if (!user) {
    return redirectTo("/login");
  }

  const { data: account } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // Authenticated (auth.users row exists) but no public.users row yet: a
  // brand-new OAuth signup pending role selection. They may reach ONLY
  // /complete-profile until that finishes creating their public.users row
  // (see src/app/complete-profile/page.tsx).
  if (!account) {
    return redirectTo("/complete-profile");
  }

  if (requiredRoles !== "any" && !requiredRoles.includes(account.role)) {
    return redirectTo(getDashboardPathForRole(account.role));
  }

  return supabaseResponse;
}

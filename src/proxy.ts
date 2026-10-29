import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` (the
 * exported function is `proxy`, not `middleware`) — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 *
 * Session refresh AND route protection both happen here: updateSession()
 * (src/lib/supabase/middleware.ts) revalidates the Supabase session, then
 * checks the requester's public.users role against PROTECTED_PREFIXES
 * (/mypage, /instructor-profile-edit, /requester-profile-edit, /post-request)
 * and redirects away from mismatched or unauthenticated requests.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Stripe's webhook (/api/stripe/webhook) has no login session; it is checked by Stripe's signature instead, so it is left out here.
    "/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

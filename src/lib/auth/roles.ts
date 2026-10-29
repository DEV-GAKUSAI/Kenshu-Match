/** Roles Kenshu Link knows how to serve. Any other role in the shared users table
 *  (for example ENGINEER from Engineer Match / Mine) is not a Kenshu Link account. */
export const KENSHU_ROLES = ["INSTRUCTOR", "COMPANY", "INDIVIDUAL", "ADMIN"] as const;

export function isKenshuRole(role: unknown): boolean {
  return typeof role === "string" && (KENSHU_ROLES as readonly string[]).includes(role);
}

/** Pages anyone can open. A Mine member (a login Kenshu Link does not serve) is only
 *  sent to the "open from Mine" notice on the other pages, never on these. */
export const PUBLIC_PATHS = [
  "/",
  "/instructors",
  "/instructor-detail",
  "/login",
  "/register",
  "/for-instructors",
  "/forgot-password",
  "/terms",
  "/privacy",
  "/contact",
  "/partner-invite",
  "/company",
] as const;

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname);
}

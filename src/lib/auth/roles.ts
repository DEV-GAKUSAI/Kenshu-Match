/** Roles Kenshu Link knows how to serve. Any other role in the shared users table
 *  (for example ENGINEER from Engineer Match / Mine) is not a Kenshu Link account. */
export const KENSHU_ROLES = ["INSTRUCTOR", "COMPANY", "INDIVIDUAL", "ADMIN"] as const;

export function isKenshuRole(role: unknown): boolean {
  return typeof role === "string" && (KENSHU_ROLES as readonly string[]).includes(role);
}

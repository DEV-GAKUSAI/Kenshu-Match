/** Where "Mineでログイン" sends a lecturer: Mine opens Kenshu Link for them in the same tab. */
export const DEFAULT_MINE_APP_URL = "https://mine-omega-one.vercel.app";

export function mineLoginUrl(base?: string | null): string {
  const root = (base && base.trim() ? base.trim() : DEFAULT_MINE_APP_URL).replace(/\/+$/, "");
  return `${root}/apps?launch=kenshulink`;
}

/** Where a new lecturer registers: Mine's sign-up, which then opens Kenshu Link for them. */
export function mineRegisterUrl(base?: string | null): string {
  const root = (base && base.trim() ? base.trim() : DEFAULT_MINE_APP_URL).replace(/\/+$/, "");
  return `${root}/register?next=${encodeURIComponent("/apps?launch=kenshulink")}`;
}

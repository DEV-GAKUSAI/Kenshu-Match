import { createHash, timingSafeEqual } from "node:crypto";

/** Database access needed to count matching open requests (implemented in supabase-store.ts). */
export interface MatchCountStore {
  getLinkedKenshuUserId(mineUserId: string): Promise<string | null>;
  getExpertiseIds(instructorId: string): Promise<string[]>;
  /** Broadcast requests an instructor can browse: pending, not directed at one person, in these fields. */
  listOpenRequestIds(subcategoryIds: string[]): Promise<string[]>;
  /** Of these requests, the ones this instructor has already answered. */
  listRespondedRequestIds(instructorId: string, requestIds: string[]): Promise<string[]>;
}

export async function countMatchingOpenRequests(store: MatchCountStore, mineUserId: string): Promise<number> {
  const kenshuUserId = await store.getLinkedKenshuUserId(mineUserId);
  if (!kenshuUserId) return 0;
  const expertiseIds = await store.getExpertiseIds(kenshuUserId);
  if (!expertiseIds.length) return 0;
  const open = await store.listOpenRequestIds(expertiseIds);
  if (!open.length) return 0;
  const responded = new Set(await store.listRespondedRequestIds(kenshuUserId, open));
  return open.filter((id) => !responded.has(id)).length;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMineUserId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Constant-time check of "Authorization: Bearer <shared secret>". */
export function isAuthorizedMatchCountRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32) return false;
  if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) return false;
  const given = createHash("sha256").update(authorization.slice(7)).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}

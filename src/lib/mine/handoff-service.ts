import { createHash } from "node:crypto";

import { planExpertiseSync, resolveSubcategoryIds, type Subcategory } from "./skill-fields.ts";

/** Everything the handoff needs from the database (implemented in supabase-store.ts). */
export interface MineHandoffStore {
  insertNonce(digest: string, expiresAtIso: string): Promise<"ok" | "replay">;
  getLinkedKenshuUserId(mineUserId: string): Promise<string | null>;
  getUserByEmail(email: string): Promise<{ id: string; role: string } | null>;
  getUserRole(id: string): Promise<string | null>;
  createAuthUser(input: {
    email: string;
    name: string;
    mineUserId: string;
  }): Promise<{ id: string } | { alreadyExists: true }>;
  findAuthUserIdByEmail(email: string): Promise<string | null>;
  ensureInstructorUserRow(input: { id: string; email: string; name: string }): Promise<void>;
  insertLink(input: { mineUserId: string; kenshuUserId: string; mineEmail: string }): Promise<"ok" | "duplicate">;
  updateUserName(id: string, name: string): Promise<void>;
  upsertInstructorProfile(id: string, contactEmail: string): Promise<void>;
  listSubcategories(): Promise<Subcategory[]>;
  getExpertiseIds(instructorId: string): Promise<string[]>;
  getSyncedIds(kenshuUserId: string): Promise<string[]>;
  addExpertise(instructorId: string, ids: string[]): Promise<void>;
  removeExpertise(instructorId: string, ids: string[]): Promise<void>;
  setSynced(kenshuUserId: string, addIds: string[], removeIds: string[]): Promise<void>;
}

export type MineHandoffInput = {
  sub: string;
  email: string;
  name: string;
  nonce: string;
  exp: number;
  /** Kenshu field names mapped from the person's Mine skills. Undefined = old Mine, skip sync. */
  fields?: string[];
};

export type SyncStatus = "skipped" | "failed" | { added: number; removed: number };

export type MineHandoffResult =
  | { ok: true; kenshuUserId: string; sync: SyncStatus }
  | { ok: false; reason: string };

export function internalEmailFor(mineUserId: string) {
  return `mine-${mineUserId}@sso.mine.local`;
}

/**
 * Creates or finds the linked Kenshu instructor for a verified Mine ticket and
 * syncs mapped skills. Every step is safe to repeat, so a half-finished first
 * attempt is completed by the next one instead of blocking the person.
 */
export async function runMineHandoff(store: MineHandoffStore, handoff: MineHandoffInput): Promise<MineHandoffResult> {
  const digest = createHash("sha256").update(handoff.nonce).digest("hex");
  if ((await store.insertNonce(digest, new Date(handoff.exp * 1000).toISOString())) === "replay") {
    return { ok: false, reason: "replay" };
  }

  const name = handoff.name.trim().slice(0, 50);
  const email = handoff.email.toLowerCase();
  let kenshuUserId = await store.getLinkedKenshuUserId(handoff.sub);

  if (!kenshuUserId) {
    const internalEmail = internalEmailFor(handoff.sub);
    const existing = await store.getUserByEmail(internalEmail);
    if (existing) {
      if (existing.role !== "INSTRUCTOR") return { ok: false, reason: "wrong_role" };
      kenshuUserId = existing.id;
    } else {
      const created = await store.createAuthUser({ email: internalEmail, name, mineUserId: handoff.sub });
      if ("alreadyExists" in created) {
        // A login was made by an earlier attempt but never got its users row.
        const authId = await store.findAuthUserIdByEmail(internalEmail);
        if (!authId) return { ok: false, reason: "orphan_not_found" };
        kenshuUserId = authId;
      } else {
        kenshuUserId = created.id;
      }
      await store.ensureInstructorUserRow({ id: kenshuUserId, email: internalEmail, name });
    }

    const linked = await store.insertLink({ mineUserId: handoff.sub, kenshuUserId, mineEmail: email });
    if (linked === "duplicate") {
      // Another tab finished first; use whatever it linked.
      const winner = await store.getLinkedKenshuUserId(handoff.sub);
      if (!winner) return { ok: false, reason: "link_conflict" };
      kenshuUserId = winner;
    }
  }

  if ((await store.getUserRole(kenshuUserId)) !== "INSTRUCTOR") return { ok: false, reason: "wrong_role" };

  await store.updateUserName(kenshuUserId, name);
  await store.upsertInstructorProfile(kenshuUserId, email);

  let sync: SyncStatus = "skipped";
  if (handoff.fields) {
    try {
      sync = await syncMappedExpertise(store, kenshuUserId, handoff.fields);
    } catch {
      // A sync problem must never stop the person from signing in.
      sync = "failed";
    }
  }
  return { ok: true, kenshuUserId, sync };
}

export async function syncMappedExpertise(
  store: MineHandoffStore,
  kenshuUserId: string,
  fieldNames: readonly string[],
): Promise<{ added: number; removed: number }> {
  const subcategories = fieldNames.length ? await store.listSubcategories() : [];
  const desired = resolveSubcategoryIds(fieldNames, subcategories);
  const [existing, previouslySynced] = await Promise.all([
    store.getExpertiseIds(kenshuUserId),
    store.getSyncedIds(kenshuUserId),
  ]);
  const plan = planExpertiseSync({ desired, existing, previouslySynced });

  if (plan.toAdd.length) await store.addExpertise(kenshuUserId, plan.toAdd);
  if (plan.toRemove.length) await store.removeExpertise(kenshuUserId, plan.toRemove);
  const syncedRemove = previouslySynced.filter((id) => !plan.syncedAfter.includes(id));
  const syncedAdd = plan.syncedAfter.filter((id) => !previouslySynced.includes(id));
  if (syncedAdd.length || syncedRemove.length) await store.setSynced(kenshuUserId, syncedAdd, syncedRemove);
  return { added: plan.toAdd.length, removed: plan.toRemove.length };
}

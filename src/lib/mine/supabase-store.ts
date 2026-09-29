import type { SupabaseClient } from "@supabase/supabase-js";

import type { MatchCountStore } from "./match-count.ts";
import type { MineHandoffStore } from "./handoff-service.ts";

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** service_role-backed implementation of the handoff and match-count stores. */
export function createSupabaseMineStore(admin: SupabaseClient): MineHandoffStore & MatchCountStore {
  return {
    async insertNonce(digest, expiresAtIso) {
      const { error } = await admin
        .from("mine_kenshu_sso_nonces")
        .insert({ token_digest: digest, expires_at: expiresAtIso });
      if (error) {
        if (error.code === "23505") return "replay";
        throw new Error(error.message);
      }
      return "ok";
    },
    async getLinkedKenshuUserId(mineUserId) {
      const { data, error } = await admin
        .from("mine_kenshu_account_links")
        .select("kenshu_user_id")
        .eq("mine_user_id", mineUserId)
        .maybeSingle();
      fail(error);
      return (data?.kenshu_user_id as string | undefined) ?? null;
    },
    async getUserByEmail(email) {
      const { data, error } = await admin.from("users").select("id, role").eq("email", email).maybeSingle();
      fail(error);
      return data ? { id: data.id as string, role: data.role as string } : null;
    },
    async getUserRole(id) {
      const { data, error } = await admin.from("users").select("role").eq("id", id).maybeSingle();
      fail(error);
      return (data?.role as string | undefined) ?? null;
    },
    async createAuthUser({ email, name, mineUserId }) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { role: "INSTRUCTOR", name, mine_user_id: mineUserId },
      });
      if (error) {
        if (error.code === "email_exists" || /already (been )?registered|already exists/i.test(error.message)) {
          return { alreadyExists: true };
        }
        throw new Error(error.message);
      }
      if (!data.user) throw new Error("createUser returned no user");
      return { id: data.user.id };
    },
    async findAuthUserIdByEmail(email) {
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      if (error) return null;
      return data.user?.id ?? null;
    },
    async ensureInstructorUserRow({ id, email, name }) {
      const { error } = await admin
        .from("users")
        .upsert({ id, role: "INSTRUCTOR", name, email }, { onConflict: "id", ignoreDuplicates: true });
      fail(error);
    },
    async insertLink({ mineUserId, kenshuUserId, mineEmail }) {
      const { error } = await admin
        .from("mine_kenshu_account_links")
        .insert({ mine_user_id: mineUserId, kenshu_user_id: kenshuUserId, mine_email: mineEmail });
      if (error) {
        if (error.code === "23505") return "duplicate";
        throw new Error(error.message);
      }
      return "ok";
    },
    async updateUserName(id, name) {
      const { error } = await admin.from("users").update({ name }).eq("id", id);
      fail(error);
    },
    async upsertInstructorProfile(id, contactEmail) {
      const { error } = await admin
        .from("instructor_profiles")
        .upsert({ id, contact_email: contactEmail }, { onConflict: "id" });
      fail(error);
    },
    async listSubcategories() {
      const { data, error } = await admin.from("training_subcategories").select("id, name");
      fail(error);
      return (data ?? []) as { id: string; name: string }[];
    },
    async getExpertiseIds(instructorId) {
      const { data, error } = await admin
        .from("instructor_expertise")
        .select("subcategory_id")
        .eq("instructor_id", instructorId);
      fail(error);
      return (data ?? []).map((row) => row.subcategory_id as string);
    },
    async getSyncedIds(kenshuUserId) {
      const { data, error } = await admin
        .from("mine_kenshu_synced_expertise")
        .select("subcategory_id")
        .eq("kenshu_user_id", kenshuUserId);
      fail(error);
      return (data ?? []).map((row) => row.subcategory_id as string);
    },
    async addExpertise(instructorId, ids) {
      const { error } = await admin
        .from("instructor_expertise")
        .upsert(ids.map((subcategory_id) => ({ instructor_id: instructorId, subcategory_id })), {
          onConflict: "instructor_id,subcategory_id",
          ignoreDuplicates: true,
        });
      fail(error);
    },
    async removeExpertise(instructorId, ids) {
      const { error } = await admin
        .from("instructor_expertise")
        .delete()
        .eq("instructor_id", instructorId)
        .in("subcategory_id", ids);
      fail(error);
    },
    async setSynced(kenshuUserId, addIds, removeIds) {
      if (addIds.length) {
        const { error } = await admin
          .from("mine_kenshu_synced_expertise")
          .upsert(addIds.map((subcategory_id) => ({ kenshu_user_id: kenshuUserId, subcategory_id })), {
            onConflict: "kenshu_user_id,subcategory_id",
            ignoreDuplicates: true,
          });
        fail(error);
      }
      if (removeIds.length) {
        const { error } = await admin
          .from("mine_kenshu_synced_expertise")
          .delete()
          .eq("kenshu_user_id", kenshuUserId)
          .in("subcategory_id", removeIds);
        fail(error);
      }
    },
    async listOpenRequestIds(subcategoryIds) {
      const { data, error } = await admin
        .from("training_requests")
        .select("request_id")
        .is("target_instructor_id", null)
        .eq("status", "pending")
        .in("expertise_field", subcategoryIds)
        .limit(5000);
      fail(error);
      return (data ?? []).map((row) => row.request_id as string);
    },
    async listRespondedRequestIds(instructorId, requestIds) {
      const responded: string[] = [];
      for (const part of chunk(requestIds, 200)) {
        const { data, error } = await admin
          .from("instructor_responses")
          .select("request_id")
          .eq("instructor_id", instructorId)
          .in("request_id", part);
        fail(error);
        responded.push(...(data ?? []).map((row) => row.request_id as string));
      }
      return responded;
    },
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { diffInvites } from "@/lib/requests/visibility";

// Invited instructors of an 招待限定 request (migration 174). Only the owner company can change them.

function db() {
  return createClient() as unknown as SupabaseClient;
}

export async function getInvites(requestId: string): Promise<string[]> {
  const { data } = await db().from("request_invites").select("instructor_id").eq("request_id", requestId);
  return ((data as { instructor_id: string }[] | null) ?? []).map((r) => r.instructor_id);
}

/** Makes the invite list of a request equal to `next` (adds new ones, removes dropped ones). */
export async function saveInvites(requestId: string, requesterId: string, next: string[]) {
  const current = await getInvites(requestId);
  const { add, remove } = diffInvites(current, next);
  if (remove.length) {
    const { error } = await db().from("request_invites").delete().eq("request_id", requestId).in("instructor_id", remove);
    if (error) return { error };
  }
  if (add.length) {
    const { error } = await db()
      .from("request_invites")
      .insert(add.map((instructor_id) => ({ request_id: requestId, instructor_id, requester_id: requesterId })));
    if (error) return { error };
  }
  return { error: null };
}

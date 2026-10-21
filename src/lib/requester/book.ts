import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

// 自社の講師台帳 (#55 評価・メモ / #57 候補・取引先). Private to the company (migration 155).

export type BookKind = "candidate" | "regular";

export type BookEntry = {
  entry_id: string;
  instructor_id: string | null;
  external_name: string | null;
  external_contact: string | null;
  list_kind: BookKind;
  rating: number | null;
  note: string | null;
  updated_at: string;
};

export const KIND_TEXT: Record<BookKind, string> = { candidate: "候補", regular: "取引先" };

const COLS = "entry_id, instructor_id, external_name, external_contact, list_kind, rating, note, updated_at";

function db() {
  return createClient() as unknown as SupabaseClient;
}

export async function getBookEntries(): Promise<BookEntry[]> {
  const { data } = await db().from("requester_instructor_book").select(COLS).order("updated_at", { ascending: false });
  return (data as BookEntry[] | null) ?? [];
}

export async function getBookEntryFor(instructorId: string): Promise<BookEntry | null> {
  const { data } = await db().from("requester_instructor_book").select(COLS).eq("instructor_id", instructorId).maybeSingle();
  return (data as BookEntry | null) ?? null;
}

export type BookInput = { list_kind: BookKind; rating: number | null; note: string | null };

/** Save the entry of a registered instructor (create or update). */
export async function saveBookEntryFor(requesterId: string, instructorId: string, input: BookInput, existingId?: string) {
  if (existingId) {
    const { error } = await db().from("requester_instructor_book").update(input).eq("entry_id", existingId);
    return { error };
  }
  const { error } = await db().from("requester_instructor_book").insert({ requester_id: requesterId, instructor_id: instructorId, ...input });
  return { error };
}

export async function addExternalEntry(requesterId: string, name: string, contact: string | null, input: BookInput) {
  const { error } = await db()
    .from("requester_instructor_book")
    .insert({ requester_id: requesterId, external_name: name.trim(), external_contact: contact?.trim() || null, ...input });
  return { error };
}

export async function updateBookEntry(entryId: string, patch: Partial<BookInput> & { external_name?: string; external_contact?: string | null }) {
  const { error } = await db().from("requester_instructor_book").update(patch).eq("entry_id", entryId);
  return { error };
}

export async function deleteBookEntry(entryId: string) {
  const { error } = await db().from("requester_instructor_book").delete().eq("entry_id", entryId);
  return { error };
}

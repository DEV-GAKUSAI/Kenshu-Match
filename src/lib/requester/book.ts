import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { BudgetUnit } from "@/lib/requests/money";

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
  /** 得意領域: 研修分野 ids (migration 194) */
  strength_field_ids: string[];
  /** 過去単価: amount in yen + unit (hour / day / total) */
  past_rate_amount: number | null;
  past_rate_unit: BudgetUnit | null;
  /** 登壇実績: free text */
  speaking_record: string | null;
  is_favorite: boolean;
  updated_at: string;
};

export const KIND_TEXT: Record<BookKind, string> = { candidate: "候補", regular: "取引先" };

const COLS = "entry_id, instructor_id, external_name, external_contact, list_kind, rating, note, strength_field_ids, past_rate_amount, past_rate_unit, speaking_record, is_favorite, updated_at";

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

/** The ledger's own fields (#57, migration 194). */
export type BookFieldsPatch = {
  strength_field_ids?: string[];
  past_rate_amount?: number | null;
  past_rate_unit?: BudgetUnit | null;
  speaking_record?: string | null;
  is_favorite?: boolean;
};

export async function updateBookEntry(entryId: string, patch: Partial<BookInput> & BookFieldsPatch & { external_name?: string; external_contact?: string | null }) {
  const { error } = await db().from("requester_instructor_book").update(patch).eq("entry_id", entryId);
  return { error };
}

export async function deleteBookEntry(entryId: string) {
  const { error } = await db().from("requester_instructor_book").delete().eq("entry_id", entryId);
  return { error };
}

// 案件別候補リスト (#57): the ledger entries a company picked as candidates for one request (migration 194).

/** How many candidates each of my requests has (request_id -> count); requests without candidates are left out. */
export async function getCandidateCounts(): Promise<Record<string, number>> {
  const { data } = await db().from("request_candidates").select("request_id");
  const counts: Record<string, number> = {};
  for (const r of (data as { request_id: string }[] | null) ?? []) counts[r.request_id] = (counts[r.request_id] ?? 0) + 1;
  return counts;
}

export async function getRequestCandidateIds(requestId: string): Promise<string[]> {
  const { data } = await db().from("request_candidates").select("entry_id").eq("request_id", requestId).order("created_at");
  return ((data as { entry_id: string }[] | null) ?? []).map((r) => r.entry_id);
}

export async function addRequestCandidate(requesterId: string, requestId: string, entryId: string) {
  const { error } = await db().from("request_candidates").insert({ request_id: requestId, entry_id: entryId, requester_id: requesterId });
  return { error };
}

export async function removeRequestCandidate(requestId: string, entryId: string) {
  const { error } = await db().from("request_candidates").delete().eq("request_id", requestId).eq("entry_id", entryId);
  return { error };
}

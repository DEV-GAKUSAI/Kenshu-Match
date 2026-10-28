import { createClient } from "@/lib/supabase/client";
import { applyMineToMatching, type MatchingProfile, type MineMe } from "@/lib/mine/my-matching";
import type { InstructorPublicDirectoryRow, WorkStyle } from "@/types/database";
import { getInstructorExpertiseIds } from "./expertise";

export async function getInstructorProfile(userId: string) {
  const supabase = createClient();
  return supabase.from("instructor_profiles").select("*").eq("id", userId).maybeSingle();
}

/** Used by the mypage instructor status card: a lighter-weight column set. */
export async function getInstructorProfileSummary(userId: string) {
  const supabase = createClient();
  return supabase
    .from("instructor_profiles")
    .select("id, is_public, prefectures, self_pr, contact_email, contact_phone")
    .eq("id", userId)
    .maybeSingle();
}

/**
 * Fields an instructor may edit on their own profile. Deliberately its own
 * type rather than Partial<InstructorProfileRow>: it excludes rating_avg
 * (a leftover column) and is_featured (admin curation flag),
 * both real columns on instructor_profiles (083_kenshu_match_baseline.sql)
 * that must never be client-writable. Keeping this decoupled from
 * InstructorProfileRow means that type gaining either column later (e.g. to
 * display a rating) can't silently widen what this function accepts.
 *
 * This is a type-level guard against our own app code, not a full security
 * boundary -- instructor_profiles_update_own/_update_self
 * (083_kenshu_match_baseline.sql) only check row ownership, not which
 * columns change, so a raw REST call using a valid session token could still
 * write these columns directly. Closing that fully needs a DB-level
 * column-privilege restriction (grant or trigger), which is a migration and
 * out of scope for this refactor.
 */
export interface EditableInstructorProfileFields {
  id: string;
  is_public?: boolean;
  prefectures?: string[] | null;
  years_of_experience?: number | null;
  self_pr?: string | null;
  work_style?: WorkStyle | null;
  desired_rate_min?: number | null;
  desired_rate_max?: number | null;
  certifications?: string[] | null;
  portfolio_url?: string | null;
  avatar_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

export async function upsertInstructorProfile(payload: EditableInstructorProfileFields) {
  const supabase = createClient();
  const { error } = await supabase.from("instructor_profiles").upsert(payload, { onConflict: "id" });
  return { error };
}

/** Bulk-fetch instructor contact info (unlocked instructor_profiles columns) for a set of ids. */
export async function getInstructorContacts(ids: string[]) {
  if (!ids.length) return {} as Record<string, { id: string; contact_email: string | null; contact_phone: string | null }>;
  const supabase = createClient();
  const { data } = await supabase
    .from("instructor_profiles")
    .select("id, contact_email, contact_phone")
    .in("id", ids);
  const map: Record<string, { id: string; contact_email: string | null; contact_phone: string | null }> = {};
  data?.forEach((i) => {
    map[i.id] = i;
  });
  return map;
}

export async function getInstructorDirectory() {
  const supabase = createClient();
  return supabase.from("instructor_public_directory").select("*").order("created_at", { ascending: false });
}

export async function getFeaturedInstructors(limit = 6) {
  const supabase = createClient();
  return supabase
    .from("instructor_public_directory")
    .select("*")
    .eq("is_featured", true)
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function getInstructorById(id: string) {
  const supabase = createClient();
  return supabase.from("instructor_public_directory").select("*").eq("id", id).maybeSingle();
}

export async function getMatchingCandidateInstructors() {
  const supabase = createClient();
  return supabase
    .from("instructor_public_directory")
    .select("id, name, work_style, desired_rate_min, prefectures, self_pr");
}

export async function getInstructorNames(ids: string[]) {
  const map: Record<string, Pick<InstructorPublicDirectoryRow, "id" | "name" | "expertise_fields">> = {};
  if (!ids.length) return map;
  const supabase = createClient();
  const { data, error } = await supabase.from("instructor_public_directory").select("id, name, expertise_fields").in("id", ids);
  if (error) {
    console.error("instructor_public_directory query error:", error);
  }
  data?.forEach((i) => {
    map[i.id] = i;
  });
  return map;
}

/** Instructor's own matching profile (work style / desired rate / expertise ids) used to compute "recommended". */
export async function getMyMatchingProfile(instructorId: string) {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("instructor_profiles")
    .select("work_style, desired_rate_min, prefectures")
    .eq("id", instructorId)
    .maybeSingle();
  const expertiseIds = await getInstructorExpertiseIds(instructorId);

  const base: MatchingProfile = {
    workStyle: profile?.work_style ?? null,
    desiredRateMin: profile?.desired_rate_min ?? null,
    prefectures: (profile?.prefectures as string[] | null | undefined) ?? [],
    expertiseIds: new Set(expertiseIds),
    skills: [],
  };
  // A lecturer linked to Mine keeps these in Mine; the old columns above are only for accounts that are not linked.
  let me: MineMe | null = null;
  try {
    const res = await fetch("/api/instructors/me", { cache: "no-store" });
    if (res.ok) me = (await res.json()) as MineMe;
  } catch {
    me = null;
  }
  return applyMineToMatching(base, me);
}

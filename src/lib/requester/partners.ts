import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

// 関係先の登録 (#53). Private to the company (migration 160).
// 協力会社のアカウント連携・提案 (migration 187): a partner company logs in with its own account.

export type PartnerKind = "company" | "instructor";

export type Partner = {
  partner_id: string;
  name: string;
  kind: PartnerKind;
  contact: string | null;
  note: string | null;
  instructor_id: string | null;
  /** The partner's own Kenshu Link account (set by an invitation code). */
  account_id?: string | null;
};

export type RequestFlow = {
  request_id: string;
  contract_partner_id: string | null;
  via_partner_ids: string[];
  speaker_partner_id: string | null;
  speaker_name: string | null;
  /** Partner companies see the amounts of this request (default: no). */
  show_amount_to_partners?: boolean;
};

export const PARTNER_KIND_TEXT: Record<PartnerKind, string> = { company: "協力会社", instructor: "講師" };

function db() {
  return createClient() as unknown as SupabaseClient;
}

/** The error code a database function raised ("not_found", "bad_name", ...). */
export function errorCode(error: { message?: string } | null | undefined): string {
  return (error?.message ?? "").trim();
}

export async function getPartners(): Promise<Partner[]> {
  const { data } = await db().from("requester_partners").select("partner_id, name, kind, contact, note, instructor_id, account_id").order("created_at", { ascending: false });
  return (data as Partner[] | null) ?? [];
}

export async function addPartner(requesterId: string, p: { name: string; kind: PartnerKind; contact: string | null; note: string | null; instructor_id: string | null }) {
  const { error } = await db().from("requester_partners").insert({ requester_id: requesterId, ...p, name: p.name.trim() });
  return { error };
}

export async function updatePartner(partnerId: string, p: { name: string; kind: PartnerKind; contact: string | null; note: string | null; instructor_id: string | null }) {
  const { error } = await db().from("requester_partners").update({ ...p, name: p.name.trim() }).eq("partner_id", partnerId);
  return { error };
}

export async function deletePartner(partnerId: string) {
  const { error } = await db().from("requester_partners").delete().eq("partner_id", partnerId);
  return { error };
}

export async function getFlow(requestId: string): Promise<RequestFlow | null> {
  const { data } = await db()
    .from("request_flows")
    .select("request_id, contract_partner_id, via_partner_ids, speaker_partner_id, speaker_name, show_amount_to_partners")
    .eq("request_id", requestId)
    .maybeSingle();
  return (data as RequestFlow | null) ?? null;
}

export async function saveFlow(requesterId: string, f: Omit<RequestFlow, "request_id"> & { request_id: string }) {
  const { error } = await db().from("request_flows").upsert({ requester_id: requesterId, ...f, updated_at: new Date().toISOString() });
  return { error };
}

// ---------------------------------------------------------------------------------------------
// Company side: invitation code, link, proposals
// ---------------------------------------------------------------------------------------------

export type Invite = { code: string; expires_at: string };

/** A new one-time code (the old one stops working). */
export async function createPartnerInvite(partnerId: string): Promise<{ invite: Invite | null; error: string | null }> {
  const { data, error } = await db().rpc("create_partner_invite", { p_partner_id: partnerId });
  const row = (data as Invite[] | null)?.[0] ?? null;
  return { invite: row, error: error ? errorCode(error) : row ? null : "unknown" };
}

/** The code that is still valid, if any. */
export async function getPartnerInvite(partnerId: string): Promise<Invite | null> {
  const { data } = await db().rpc("get_partner_invite", { p_partner_id: partnerId });
  return (data as Invite[] | null)?.[0] ?? null;
}

export async function unlinkPartner(partnerId: string) {
  const { error } = await db().rpc("unlink_partner", { p_partner_id: partnerId });
  return { error: error ? errorCode(error) : null };
}

export type ProposalStatus = "new" | "accepted" | "passed" | "withdrawn";

export type Proposal = {
  proposal_id: string;
  request_id: string;
  partner_id: string;
  lecturer_name: string;
  instructor_id: string | null;
  note: string | null;
  status: ProposalStatus;
  created_at: string;
};

const PROPOSAL_COLS = "proposal_id, request_id, partner_id, lecturer_name, instructor_id, note, status, created_at";

/** Proposals of one request (the company that owns it sees all of them). */
export async function getProposals(requestId: string): Promise<Proposal[]> {
  const { data } = await db().from("partner_proposals").select(PROPOSAL_COLS).eq("request_id", requestId).order("created_at", { ascending: false });
  return (data as Proposal[] | null) ?? [];
}

/** How many proposals wait for an answer, per request (only for the given requests). */
export async function getNewProposalCounts(requestIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!requestIds.length) return out;
  const { data } = await db().from("partner_proposals").select("request_id").eq("status", "new").in("request_id", requestIds);
  for (const row of (data as { request_id: string }[] | null) ?? []) out[row.request_id] = (out[row.request_id] ?? 0) + 1;
  return out;
}

/** Adopt (採用) or pass on (見送る). Result "speaker_set" = the 登壇講師 of the 商流 was set. */
export async function decideProposal(proposalId: string, accept: boolean): Promise<{ result: "speaker_set" | "noted" | null; error: string | null }> {
  const { data, error } = await db().rpc("decide_partner_proposal", { p_proposal_id: proposalId, p_accept: accept });
  if (error) return { result: null, error: errorCode(error) };
  return { result: data === "speaker_set" ? "speaker_set" : "noted", error: null };
}

// ---------------------------------------------------------------------------------------------
// Partner side: enter a code, see the requests, propose a lecturer
// ---------------------------------------------------------------------------------------------

export type PartnerLink = { partner_id: string; company_name: string | null; partner_name: string };

export type PartnerRequest = {
  request_id: string;
  title: string;
  description: string;
  status: string;
  publish_state: string;
  preferred_format: string;
  location: string | null;
  participant_count: number | null;
  schedule_days: unknown;
  company_name: string | null;
  partner_id: string;
  partner_name: string;
  my_role: "contract" | "via";
  speaker_name: string | null;
  show_amount: boolean;
  /** Money fields, only when the company switched amounts on for this request. */
  money: Record<string, unknown> | null;
  /** My own proposals for this request (the database sends no request/partner ids here). */
  proposals: Omit<Proposal, "request_id" | "partner_id">[];
  created_at: string;
};

export type AcceptResult = { ok: true; company_name: string | null; partner_name: string } | { ok: false; reason: string };

export async function acceptPartnerInvite(code: string): Promise<AcceptResult> {
  const { data, error } = await db().rpc("accept_partner_invite", { p_code: code });
  if (error) return { ok: false, reason: errorCode(error) };
  const r = data as { ok?: boolean; reason?: string; company_name?: string | null; partner_name?: string } | null;
  if (r?.ok) return { ok: true, company_name: r.company_name ?? null, partner_name: r.partner_name ?? "" };
  return { ok: false, reason: r?.reason ?? "unknown" };
}

export async function getPartnerLinks(): Promise<PartnerLink[]> {
  const { data } = await db().rpc("partner_my_links");
  return (data as PartnerLink[] | null) ?? [];
}

export async function getPartnerRequests(): Promise<PartnerRequest[]> {
  const { data } = await db().rpc("partner_requests");
  return (data as PartnerRequest[] | null) ?? [];
}

export async function proposeLecturer(requestId: string, name: string, instructorId: string | null, note: string | null) {
  const { error } = await db().rpc("partner_propose_lecturer", { p_request_id: requestId, p_name: name, p_instructor_id: instructorId, p_note: note });
  return { error: error ? errorCode(error) : null };
}

export async function withdrawProposal(proposalId: string) {
  const { error } = await db().rpc("partner_withdraw_proposal", { p_proposal_id: proposalId });
  return { error: error ? errorCode(error) : null };
}

export async function leavePartner(partnerId: string) {
  const { error } = await db().rpc("leave_partner", { p_partner_id: partnerId });
  return { error: error ? errorCode(error) : null };
}

/** Public instructors (id + name) for the "choose from Kenshu Link" box of a proposal. */
export async function getInstructorChoices(): Promise<{ id: string; name: string }[]> {
  const { data } = await db().from("instructor_public_directory").select("id, name").order("created_at", { ascending: false }).limit(500);
  return ((data as { id: string; name: string | null }[] | null) ?? []).filter((r) => !!r.name).map((r) => ({ id: r.id, name: r.name as string }));
}

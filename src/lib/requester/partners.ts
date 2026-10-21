import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

// 関係先の登録 (#53). Private to the company (migration 160).

export type PartnerKind = "company" | "instructor";

export type Partner = {
  partner_id: string;
  name: string;
  kind: PartnerKind;
  contact: string | null;
  note: string | null;
};

export type RequestFlow = {
  request_id: string;
  contract_partner_id: string | null;
  via_partner_ids: string[];
  speaker_partner_id: string | null;
  speaker_name: string | null;
};

export const PARTNER_KIND_TEXT: Record<PartnerKind, string> = { company: "協力会社", instructor: "講師" };

function db() {
  return createClient() as unknown as SupabaseClient;
}

export async function getPartners(): Promise<Partner[]> {
  const { data } = await db().from("requester_partners").select("partner_id, name, kind, contact, note").order("created_at", { ascending: false });
  return (data as Partner[] | null) ?? [];
}

export async function addPartner(requesterId: string, p: { name: string; kind: PartnerKind; contact: string | null; note: string | null }) {
  const { error } = await db().from("requester_partners").insert({ requester_id: requesterId, ...p, name: p.name.trim() });
  return { error };
}

export async function updatePartner(partnerId: string, p: { name: string; kind: PartnerKind; contact: string | null; note: string | null }) {
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
    .select("request_id, contract_partner_id, via_partner_ids, speaker_partner_id, speaker_name")
    .eq("request_id", requestId)
    .maybeSingle();
  return (data as RequestFlow | null) ?? null;
}

export async function saveFlow(requesterId: string, f: Omit<RequestFlow, "request_id"> & { request_id: string }) {
  const { error } = await db().from("request_flows").upsert({ requester_id: requesterId, ...f, updated_at: new Date().toISOString() });
  return { error };
}

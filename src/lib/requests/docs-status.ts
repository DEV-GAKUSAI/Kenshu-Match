import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { DocState } from "./docs-wait.ts";

/** Order and invoice status of several decided replies at once (for the red dots on the list). */
export async function getDocStates(responseIds: string[]): Promise<Record<string, DocState>> {
  const out: Record<string, DocState> = {};
  if (responseIds.length === 0) return out;
  const db = createClient() as unknown as SupabaseClient;
  const [orders, invoices] = await Promise.all([
    db.from("request_orders").select("response_id, status, revision").in("response_id", responseIds),
    db.from("request_invoices").select("response_id, status, revision").in("response_id", responseIds),
  ]);
  for (const o of (orders.data as { response_id: string; status: string; revision: number }[] | null) ?? []) {
    out[o.response_id] = { ...out[o.response_id], order: { status: o.status, revision: o.revision } };
  }
  for (const v of (invoices.data as { response_id: string; status: string; revision: number }[] | null) ?? []) {
    out[v.response_id] = { ...out[v.response_id], invoice: { status: v.status, revision: v.revision } };
  }
  return out;
}

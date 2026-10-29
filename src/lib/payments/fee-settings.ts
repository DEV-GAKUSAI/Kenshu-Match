import type { SupabaseClient } from "@supabase/supabase-js";

/** The fee amount (yen, tax included) from public.fee_settings. Server only. Returns null when it is missing or not a whole positive number. */
export async function feeAmountYen(admin: SupabaseClient): Promise<number | null> {
  const { data, error } = await admin.from("fee_settings").select("amount_yen").eq("id", true).maybeSingle();
  if (error || !data) return null;
  const amount = Number((data as { amount_yen: unknown }).amount_yen);
  return Number.isInteger(amount) && amount > 0 ? amount : null;
}

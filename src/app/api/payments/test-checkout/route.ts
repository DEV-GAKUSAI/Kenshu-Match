import { NextRequest, NextResponse } from "next/server";

import { feeAmountYen } from "@/lib/payments/fee-settings";
import { createCheckoutSession } from "@/lib/payments/stripe-checkout";
import { testSecretKey } from "@/lib/payments/stripe-key";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

/**
 * POST /api/payments/test-checkout  (#65 stage 1, TEST MODE ONLY)
 * An ADMIN presses the test button: we save a "pending" fee_payments row, ask Stripe for a hosted card page
 * for the fixed fee (read from public.fee_settings, never from the browser), and return that page's address.
 * The row becomes "paid" only when Stripe's signed message arrives at /api/stripe/webhook.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return fail("forbidden", 403);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("not_signed_in", 401);

  const { data: me } = await supabase.from("users").select("role").eq("id", auth.user.id).maybeSingle();
  if (me?.role !== "ADMIN") return fail("forbidden", 403);

  const secretKey = testSecretKey(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) return fail("stripe_test_key_missing", 503);

  const admin = createAdminClient();
  if (!admin) return fail("unavailable", 503);

  const amountYen = await feeAmountYen(admin);
  if (!amountYen) return fail("fee_not_set", 503);

  const { data: row, error: insertError } = await admin
    .from("fee_payments")
    .insert({ payer_id: auth.user.id, kind: "test", amount_yen: amountYen })
    .select("payment_id")
    .single();
  if (insertError || !row) {
    console.error("[payments] could not save the pending payment", insertError?.message);
    return fail("save_failed", 500);
  }
  const paymentId = row.payment_id as string;

  const base = request.nextUrl.origin;
  const session = await createCheckoutSession(secretKey, {
    paymentId,
    amountYen,
    kind: "test",
    successUrl: `${base}/admin/payments-test?result=success`,
    cancelUrl: `${base}/admin/payments-test?result=cancel`,
  });
  if (!session.ok) {
    console.error("[payments] Stripe refused the Checkout Session", session.status, session.message);
    await admin.from("fee_payments").delete().eq("payment_id", paymentId).eq("status", "pending");
    return fail("stripe_error", 502);
  }

  const { error: updateError } = await admin.from("fee_payments").update({ stripe_session_id: session.sessionId }).eq("payment_id", paymentId);
  if (updateError) console.error("[payments] could not save the Stripe session id", updateError.message);

  return NextResponse.json({ url: session.url }, { headers: noStore });
}

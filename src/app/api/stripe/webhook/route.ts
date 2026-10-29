import { NextResponse } from "next/server";

import { interpretStripeEvent, paidAmountMatches } from "@/lib/payments/stripe-events";
import { verifyStripeSignature } from "@/lib/payments/stripe-signature";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook  (#65 stage 1, TEST MODE ONLY)
 * Stripe calls this when a payment page is paid or expires. No login: the sender is proved by the Stripe-Signature
 * header (HMAC with STRIPE_WEBHOOK_SECRET) over the raw body. The same event id is never processed twice.
 * Nothing sensitive is logged (ids, status, amount only).
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return new Response("not configured", { status: 500 });
  }

  // The signature covers the exact text we received, so read it as text (do not parse and re-write it).
  const body = await request.text();
  const checked = verifyStripeSignature(body, request.headers.get("stripe-signature"), secret);
  if (!checked.ok) {
    console.warn("[stripe-webhook] signature refused:", checked.reason);
    return new Response("invalid signature", { status: 400 });
  }

  let event: { id?: unknown; type?: unknown; livemode?: unknown };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("invalid body", { status: 400 });
  }
  const eventId = typeof event.id === "string" ? event.id : "";
  const eventType = typeof event.type === "string" ? event.type : "";
  if (!eventId || !eventType) return new Response("invalid event", { status: 400 });
  // Stage 1 is test mode only: a live-mode event is refused.
  if (event.livemode === true) {
    console.warn("[stripe-webhook] live-mode event refused in test stage");
    return new Response("live mode not enabled", { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return new Response("unavailable", { status: 503 });

  // Remember the event first. If it is already there, Stripe is just sending it again: answer OK and do nothing.
  const { error: seen } = await admin.from("stripe_events").insert({ event_id: eventId, event_type: eventType, livemode: false });
  if (seen) {
    if (seen.code === "23505") return NextResponse.json({ received: true, duplicate: true });
    console.error("[stripe-webhook] could not record the event", seen.message);
    return new Response("storage error", { status: 500 });
  }

  const action = interpretStripeEvent(event);
  try {
    if (action.type === "paid") {
      const { data: row } = await admin.from("fee_payments").select("payment_id, amount_yen, status").eq("payment_id", action.paymentId).maybeSingle();
      if (!row) {
        console.warn("[stripe-webhook] paid event for an unknown payment", action.paymentId);
      } else if (!paidAmountMatches(Number(row.amount_yen), action)) {
        console.error("[stripe-webhook] amount mismatch", action.paymentId, action.amountTotal, action.currency);
        const { error } = await admin.from("fee_payments").update({ status: "mismatch", stripe_session_id: action.sessionId }).eq("payment_id", action.paymentId).eq("status", "pending");
        if (error) throw error;
      } else {
        const { error } = await admin
          .from("fee_payments")
          .update({ status: "paid", paid_at: new Date().toISOString(), stripe_session_id: action.sessionId, stripe_payment_intent_id: action.paymentIntentId })
          .eq("payment_id", action.paymentId)
          .eq("status", "pending");
        if (error) throw error;
      }
    } else if (action.type === "expired") {
      const { error } = await admin.from("fee_payments").update({ status: "expired" }).eq("payment_id", action.paymentId).eq("status", "pending");
      if (error) throw error;
    }
  } catch (error) {
    // Let Stripe try again: forget the event so the retry is processed.
    console.error("[stripe-webhook] processing failed", (error as { message?: string })?.message);
    await admin.from("stripe_events").delete().eq("event_id", eventId);
    return new Response("processing error", { status: 500 });
  }

  console.log(`[stripe-webhook] ${eventId} ${eventType} -> ${action.type}`);
  return NextResponse.json({ received: true });
}

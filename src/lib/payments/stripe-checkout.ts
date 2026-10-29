import { feeProductName, taxPartOf, type FeeKind } from "./fees.ts";

export type CheckoutInput = {
  paymentId: string;
  amountYen: number;
  kind: FeeKind;
  successUrl: string;
  cancelUrl: string;
};

/** Form fields for Stripe's "create Checkout Session" call: one card payment, JPY, amount fixed by the server. */
export function buildCheckoutForm(input: CheckoutInput): URLSearchParams {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("payment_method_types[0]", "card");
  form.set("client_reference_id", input.paymentId);
  form.set("success_url", input.successUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "jpy");
  form.set("line_items[0][price_data][unit_amount]", String(input.amountYen));
  form.set("line_items[0][price_data][product_data][name]", feeProductName(input.kind));
  form.set("line_items[0][price_data][product_data][description]", `うち消費税 ${taxPartOf(input.amountYen)}円`);
  form.set("metadata[payment_id]", input.paymentId);
  form.set("metadata[kind]", input.kind);
  return form;
}

export type CheckoutResult = { ok: true; sessionId: string; url: string } | { ok: false; status: number; message: string };

/** Calls Stripe. The Idempotency-Key is our payment id, so a repeated call for the same row cannot create a second session. */
export async function createCheckoutSession(secretKey: string, input: CheckoutInput, fetchImpl: typeof fetch = fetch): Promise<CheckoutResult> {
  const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `fee-${input.paymentId}`,
    },
    body: buildCheckoutForm(input).toString(),
  });
  const json = (await res.json().catch(() => null)) as { id?: string; url?: string; error?: { message?: string } } | null;
  if (!res.ok || !json?.id || !json.url) {
    return { ok: false, status: res.status, message: json?.error?.message ?? "Stripe request failed" };
  }
  return { ok: true, sessionId: json.id, url: json.url };
}

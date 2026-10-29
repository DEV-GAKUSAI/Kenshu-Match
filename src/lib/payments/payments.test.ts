import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { taxPartOf, feeProductName, isFeeKind } from "./fees.ts";
import { testSecretKey } from "./stripe-key.ts";
import { verifyStripeSignature } from "./stripe-signature.ts";
import { interpretStripeEvent, paidAmountMatches } from "./stripe-events.ts";
import { buildCheckoutForm, createCheckoutSession } from "./stripe-checkout.ts";

const SECRET = "whsec_test_secret_value";
const PID = "0b6f0c0e-6f1a-4f7e-9d49-2a5c2e0b1f11";
const sign = (body: string, t: number, secret = SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

test("fee: 1,100円 includes 100円 tax", () => {
  assert.equal(taxPartOf(1100), 100);
  assert.equal(isFeeKind("apply"), true);
  assert.equal(isFeeKind("refund"), false);
  assert.match(feeProductName("apply"), /応募料/);
});

test("only a Stripe TEST key is accepted", () => {
  assert.equal(testSecretKey("sk_test_abcdefghijklmnop"), "sk_test_abcdefghijklmnop");
  assert.equal(testSecretKey("sk_live_abcdefghijklmnop"), null);
  assert.equal(testSecretKey("rk_live_abcdefghijklmnop"), null);
  assert.equal(testSecretKey(""), null);
  assert.equal(testSecretKey(undefined), null);
  assert.equal(testSecretKey("sk_test_"), null);
});

test("signature: valid, wrong secret, changed body, old, missing, malformed", () => {
  const body = '{"id":"evt_1"}';
  const now = 1_800_000_000;
  assert.deepEqual(verifyStripeSignature(body, sign(body, now), SECRET, now), { ok: true });
  assert.deepEqual(verifyStripeSignature(body, sign(body, now, "whsec_other"), SECRET, now), { ok: false, reason: "mismatch" });
  assert.deepEqual(verifyStripeSignature(body + " ", sign(body, now), SECRET, now), { ok: false, reason: "mismatch" });
  assert.deepEqual(verifyStripeSignature(body, sign(body, now - 1000), SECRET, now), { ok: false, reason: "too_old" });
  assert.deepEqual(verifyStripeSignature(body, null, SECRET, now), { ok: false, reason: "missing" });
  assert.deepEqual(verifyStripeSignature(body, "garbage", SECRET, now), { ok: false, reason: "malformed" });
  assert.deepEqual(verifyStripeSignature(body, `t=${now},v1=zz`, SECRET, now), { ok: false, reason: "mismatch" });
});

test("signature: any one of several v1 values may match", () => {
  const body = "{}";
  const now = 1_800_000_000;
  const good = sign(body, now).split("v1=")[1];
  assert.deepEqual(verifyStripeSignature(body, `t=${now},v1=${"0".repeat(64)},v1=${good}`, SECRET, now), { ok: true });
});

const completed = (over: Record<string, unknown> = {}) => ({
  id: "evt_1",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_1", client_reference_id: PID, payment_status: "paid", payment_intent: "pi_1", amount_total: 1100, currency: "jpy", ...over } },
});

test("event: paid card payment becomes a paid action", () => {
  const action = interpretStripeEvent(completed());
  assert.equal(action.type, "paid");
  if (action.type === "paid") {
    assert.equal(action.paymentId, PID);
    assert.equal(paidAmountMatches(1100, action), true);
    assert.equal(paidAmountMatches(1000, action), false);
    assert.equal(paidAmountMatches(1100, { amountTotal: 1100, currency: "usd" }), false);
  }
});

test("event: unpaid, unknown type, bad ids are ignored; expired is understood", () => {
  assert.equal(interpretStripeEvent(completed({ payment_status: "unpaid" })).type, "ignore");
  assert.equal(interpretStripeEvent(completed({ client_reference_id: "not-a-uuid" })).type, "ignore");
  assert.equal(interpretStripeEvent(completed({ client_reference_id: null })).type, "ignore");
  assert.equal(interpretStripeEvent({ type: "invoice.paid", data: { object: {} } }).type, "ignore");
  assert.equal(interpretStripeEvent(null).type, "ignore");
  assert.equal(interpretStripeEvent({ ...completed(), type: "checkout.session.expired" }).type, "expired");
});

test("checkout form: amount, currency and card only come from our side", () => {
  const form = buildCheckoutForm({ paymentId: PID, amountYen: 1100, kind: "test", successUrl: "https://x/ok", cancelUrl: "https://x/no" });
  assert.equal(form.get("mode"), "payment");
  assert.equal(form.get("payment_method_types[0]"), "card");
  assert.equal(form.get("line_items[0][price_data][currency]"), "jpy");
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "1100");
  assert.equal(form.get("client_reference_id"), PID);
  assert.match(form.get("line_items[0][price_data][product_data][description]") ?? "", /100円/);
});

test("checkout call: sends the key and an idempotency key; reports Stripe errors", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const ok = await createCheckoutSession(
    "sk_test_abcdefghijklmnop",
    { paymentId: PID, amountYen: 1100, kind: "test", successUrl: "https://x/ok", cancelUrl: "https://x/no" },
    (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }), { status: 200 });
    }) as unknown as typeof fetch,
  );
  assert.deepEqual(ok, { ok: true, sessionId: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
  const headers = (seen as unknown as { init: { headers: Record<string, string> } }).init.headers;
  assert.equal(headers["Idempotency-Key"], `fee-${PID}`);
  assert.match(headers.Authorization, /^Bearer sk_test_/);

  const bad = await createCheckoutSession(
    "sk_test_abcdefghijklmnop",
    { paymentId: PID, amountYen: 1100, kind: "test", successUrl: "a", cancelUrl: "b" },
    (async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 400 })) as unknown as typeof fetch,
  );
  assert.deepEqual(bad, { ok: false, status: 400, message: "nope" });
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PaymentAction =
  | { type: "paid"; paymentId: string; sessionId: string; paymentIntentId: string | null; amountTotal: number | null; currency: string | null }
  | { type: "expired"; paymentId: string; sessionId: string }
  | { type: "ignore" };

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose | null => (v && typeof v === "object" ? (v as Loose) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Reads one Stripe event and says what to do with our payment row. Anything we do not use is "ignore". */
export function interpretStripeEvent(event: unknown): PaymentAction {
  const e = obj(event);
  const session = obj(obj(e?.data)?.object);
  if (!e || !session) return { type: "ignore" };

  const paymentId = str(session.client_reference_id);
  const sessionId = str(session.id);
  if (!paymentId || !UUID.test(paymentId) || !sessionId) return { type: "ignore" };

  if (e.type === "checkout.session.completed") {
    // Card payments are "paid" at once. Anything else (for example a delayed method) is not treated as paid.
    if (session.payment_status !== "paid") return { type: "ignore" };
    return {
      type: "paid",
      paymentId,
      sessionId,
      paymentIntentId: str(session.payment_intent),
      amountTotal: typeof session.amount_total === "number" ? session.amount_total : null,
      currency: str(session.currency),
    };
  }
  if (e.type === "checkout.session.expired") return { type: "expired", paymentId, sessionId };
  return { type: "ignore" };
}

/** What we compare before marking a payment paid: the amount and currency Stripe took must equal what we asked for. */
export function paidAmountMatches(expectedYen: number, action: { amountTotal: number | null; currency: string | null }): boolean {
  return action.amountTotal === expectedYen && (action.currency ?? "").toLowerCase() === "jpy";
}

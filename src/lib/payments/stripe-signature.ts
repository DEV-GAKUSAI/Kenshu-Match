import { createHmac, timingSafeEqual } from "node:crypto";

/** Stripe signs each webhook: header "Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>]", hex = HMAC-SHA256(secret, `${t}.${rawBody}`). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureResult = { ok: true } | { ok: false; reason: "missing" | "malformed" | "too_old" | "mismatch" };

export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSeconds: number = Math.floor(Date.now() / 1000)): SignatureResult {
  if (!header || !secret) return { ok: false, reason: "missing" };

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t") timestamp = Number(value);
    else if (key === "v1") signatures.push(value);
  }
  if (timestamp === null || !Number.isInteger(timestamp) || signatures.length === 0) return { ok: false, reason: "malformed" };
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "too_old" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  for (const candidate of signatures) {
    if (!/^[0-9a-f]+$/i.test(candidate) || candidate.length !== expected.length * 2) continue;
    if (timingSafeEqual(Buffer.from(candidate, "hex"), expected)) return { ok: true };
  }
  return { ok: false, reason: "mismatch" };
}

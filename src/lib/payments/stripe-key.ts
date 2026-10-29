/** Stage 1 is TEST MODE ONLY: a key that is not a Stripe test key (sk_test_) is refused, so real money can never move by mistake. */
export function testSecretKey(raw: string | undefined): string | null {
  const key = (raw ?? "").trim();
  return key.startsWith("sk_test_") && key.length > 12 ? key : null;
}

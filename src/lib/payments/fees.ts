/** The fee for one "apply" or one "contact": ¥1,100, tax included (本体1,000円 + 消費税100円). Read from public.fee_settings on the server. */
export const FEE_KINDS = ["test", "apply", "contact"] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

export const FEE_STATUSES = ["pending", "paid", "expired", "mismatch"] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];

export function isFeeKind(value: unknown): value is FeeKind {
  return typeof value === "string" && (FEE_KINDS as readonly string[]).includes(value);
}

/** Text shown on Stripe's payment page. */
export function feeProductName(kind: FeeKind): string {
  if (kind === "apply") return "応募料（税込）";
  if (kind === "contact") return "コンタクト料（税込）";
  return "テスト決済（税込）";
}

/** Tax part of a tax-included yen amount at 10% (1,100円 → 100円). */
export function taxPartOf(amountYen: number): number {
  return Math.floor((amountYen * 10) / 110);
}

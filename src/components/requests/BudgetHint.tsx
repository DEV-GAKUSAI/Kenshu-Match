import { budgetAmountText, budgetMode, quoteVsRange, type MoneyFields } from "@/lib/requests/money";

/**
 * Under a quote price box: the company's budget when it is a range or 応相談, and (for a range) whether the typed
 * price is inside it. A hint only; it never blocks a quote. Shows nothing for a fixed budget (#44).
 */
export function BudgetHint({ request, price }: { request: MoneyFields; price: string }) {
  const mode = budgetMode(request);
  if (mode === "fixed") return null;
  const text = budgetAmountText(request);
  if (!text) return null;
  const typed = Number(price);
  const where = mode === "range" && typed > 0 ? quoteVsRange(request, { quote_price: typed, quote_unit: request.budget_unit }) : null;
  return (
    <small style={{ display: "block", marginTop: 4, color: "var(--color-ink-soft)" }}>
      企業の予算：{text}
      {where === "in" ? "　入力した金額は予算の範囲内です。" : where === "out" ? "　入力した金額は予算の範囲外です。送信はできます。" : ""}
    </small>
  );
}

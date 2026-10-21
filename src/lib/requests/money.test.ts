import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetText, costLines, formatMoney, isHourly, quoteText } from "./money.ts";

test("formatMoney writes unit and tax", () => {
  assert.equal(formatMoney(15000, "hour", "excluded"), "¥15,000／時間（税別）");
  assert.equal(formatMoney(80000, "day", "included"), "¥80,000／日（税込）");
  assert.equal(formatMoney(300000, "total", "included"), "¥300,000（総額・税込）");
  assert.equal(formatMoney(300000, "total", "unspecified"), "¥300,000（総額）");
  assert.equal(formatMoney(15000, null, null), "¥15,000／時間");
});

test("budgetText and quoteText", () => {
  assert.equal(budgetText({ budget: null }), null);
  assert.equal(budgetText({ budget: 100000, budget_unit: "total", tax_mode: "excluded" }), "予算 ¥100,000（総額・税別）");
  assert.equal(quoteText({ quote_price: 14000, quote_unit: null, quote_tax_mode: null }), "見積り ¥14,000／時間");
});

test("costLines leaves unspecified out", () => {
  assert.deepEqual(costLines({ budget: 1 }), []);
  assert.deepEqual(
    costLines({ budget: 1, transport_cost: "company", lodging_cost: "unspecified", prep_cost: "extra", payment_terms: "月末締め翌月末払い" }),
    ["交通費：企業が負担", "準備・事前打合せ：別途", "支払条件：月末締め翌月末払い"],
  );
});

test("isHourly", () => {
  assert.equal(isHourly({}), true);
  assert.equal(isHourly({ budget_unit: "total" }), false);
});

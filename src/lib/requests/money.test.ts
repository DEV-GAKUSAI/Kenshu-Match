import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetAmountText, budgetInputError, budgetText, budgetUpper, costAmountError, costLines, formatMoney, isHourly, quoteText, quoteVsRange } from "./money.ts";

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

import { amountError, MAX_AMOUNT } from "./money.ts";
test("amount limit (#50)", () => {
  assert.equal(amountError(14000, "見積り金額"), null);
  assert.equal(amountError(MAX_AMOUNT, "見積り金額"), null);
  assert.match(amountError(MAX_AMOUNT + 1, "見積り金額") ?? "", /10,000,000円以下/);
  assert.match(amountError(1_000_000_000_000, "予算") ?? "", /予算は10,000,000円以下/);
  assert.match(amountError(0, "予算") ?? "", /1円以上の整数/);
  assert.match(amountError(10.5, "予算") ?? "", /1円以上の整数/);
});


test("budgetText: fixed stays as before, range and 応相談 are new", () => {
  assert.equal(budgetText({ budget: 15000, budget_unit: "hour", tax_mode: "excluded" }), "予算 ¥15,000／時間（税別）");
  assert.equal(budgetText({ budget: 15000, budget_unit: "hour", tax_mode: "excluded", budget_mode: "fixed" }), "予算 ¥15,000／時間（税別）");
  assert.equal(budgetText({ budget: 10000, budget_max: 15000, budget_mode: "range", budget_unit: "hour", tax_mode: "excluded" }), "予算の目安 ¥10,000〜¥15,000／時間（税別）");
  assert.equal(budgetText({ budget: 100000, budget_max: 200000, budget_mode: "range", budget_unit: "total", tax_mode: "unspecified" }), "予算の目安 ¥100,000〜¥200,000（総額）");
  assert.equal(budgetText({ budget: null, budget_mode: "negotiable", budget_unit: "day", tax_mode: "included" }), "予算 応相談（1日あたり・税込）");
  assert.equal(budgetText({ budget: null }), null);
  assert.equal(budgetAmountText({ budget: null, budget_mode: "range" }), null);
});

test("budgetUpper: the most the company would pay", () => {
  assert.equal(budgetUpper({ budget: 15000 }), 15000);
  assert.equal(budgetUpper({ budget: 10000, budget_max: 15000, budget_mode: "range" }), 15000);
  assert.equal(budgetUpper({ budget: null, budget_mode: "negotiable" }), null);
});

test("budgetInputError", () => {
  assert.equal(budgetInputError({ mode: "fixed", budget: "", budgetMax: "" }), null);
  assert.equal(budgetInputError({ mode: "fixed", budget: "15000", budgetMax: "" }), null);
  assert.ok(budgetInputError({ mode: "fixed", budget: "99999999", budgetMax: "" }));
  assert.equal(budgetInputError({ mode: "negotiable", budget: "", budgetMax: "" }), null);
  assert.ok(budgetInputError({ mode: "range", budget: "", budgetMax: "15000" }));
  assert.ok(budgetInputError({ mode: "range", budget: "10000", budgetMax: "" }));
  assert.equal(budgetInputError({ mode: "range", budget: "10000", budgetMax: "10000" }), "上限は下限より大きい金額にしてください。");
  assert.equal(budgetInputError({ mode: "range", budget: "10000", budgetMax: "9000" }), "上限は下限より大きい金額にしてください。");
  assert.ok(budgetInputError({ mode: "range", budget: "10000", budgetMax: "20000000" }));
  assert.equal(budgetInputError({ mode: "range", budget: "10000", budgetMax: "15000" }), null);
});

test("costAmountError", () => {
  assert.equal(costAmountError({ prep: "", pretraining: "" }), null);
  assert.equal(costAmountError({ prep: "5000", pretraining: "30000" }), null);
  assert.ok(costAmountError({ prep: "0", pretraining: "" }));
  assert.ok(costAmountError({ prep: "", pretraining: "1.5" }));
  assert.ok(costAmountError({ prep: "", pretraining: "20000000" }));
});

test("costLines: the two amounts", () => {
  assert.deepEqual(costLines({ budget: 1, prep_cost: "extra", prep_amount: 5000, pretraining_amount: 30000 }), ["準備・事前打合せ：別途（¥5,000）", "事前研修費：¥30,000（別途）"]);
  assert.deepEqual(costLines({ budget: 1, prep_cost: "extra" }), ["準備・事前打合せ：別途"]);
  assert.deepEqual(costLines({ budget: 1, prep_cost: "included" }), ["準備・事前打合せ：料金に含む"]);
});

test("quoteVsRange: only for a range with the same unit", () => {
  const r = { budget: 10000, budget_max: 15000, budget_mode: "range", budget_unit: "hour" };
  assert.equal(quoteVsRange(r, { quote_price: 12000, quote_unit: "hour" }), "in");
  assert.equal(quoteVsRange(r, { quote_price: 16000, quote_unit: "hour" }), "out");
  assert.equal(quoteVsRange(r, { quote_price: 9000 }), "out");
  assert.equal(quoteVsRange(r, { quote_price: 12000, quote_unit: "day" }), null);
  assert.equal(quoteVsRange({ budget: 15000 }, { quote_price: 12000 }), null);
  assert.equal(quoteVsRange(r, { quote_price: null }), null);
});

test("quoteVsRange: 税込 vs 税別 cannot be compared; unspecified is compared as is (#44)", async () => {
  const { quoteVsRange } = await import("./money.ts");
  const r = { budget: 10000, budget_max: 15000, budget_mode: "range" as const, budget_unit: "hour", tax_mode: "excluded" };
  assert.equal(quoteVsRange(r, { quote_price: 12000, quote_unit: "hour", quote_tax_mode: "excluded" }), "in");
  assert.equal(quoteVsRange(r, { quote_price: 12000, quote_unit: "hour", quote_tax_mode: "included" }), null);
  assert.equal(quoteVsRange(r, { quote_price: 12000, quote_unit: "hour", quote_tax_mode: null }), "in");
  assert.equal(quoteVsRange(r, { quote_price: 18000, quote_unit: "hour", quote_tax_mode: "excluded" }), "out");
});

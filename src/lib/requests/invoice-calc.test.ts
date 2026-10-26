import assert from "node:assert/strict";
import { test } from "node:test";

import { bankError, calcInvoice, diffInvoices, normalizeBank, receiptError, registrationError, toHalfWidth } from "./invoice-calc.ts";

const bank = { bank: "みずほ銀行", branch: "渋谷支店", type: "普通", number: "1234567", holder: "タナカ タロウ" };

test("calcInvoice: 税別 adds 10% (rounded down) to 講師料 and 追加費用", () => {
  const t = calcInvoice({ base_amount: 20000, amount_unit: "hour", tax_mode: "excluded", quantity: 6, extra_amount: 2000, extra_note: "交通費" });
  assert.equal(t.subtotal, 122000);
  assert.equal(t.tax, 12200);
  assert.equal(t.total, 134200);
  assert.equal(t.lines.length, 2);
  assert.equal(t.lines[1].name, "追加費用：交通費");
});

test("calcInvoice: 税込 keeps the total and shows the tax inside", () => {
  const t = calcInvoice({ base_amount: 110000, amount_unit: "total", tax_mode: "included" });
  assert.equal(t.total, 110000);
  assert.equal(t.tax, 10000);
  assert.equal(t.subtotal, 100000);
});

test("calcInvoice: per-hour price without 時間数 has no total", () => {
  const t = calcInvoice({ base_amount: 20000, amount_unit: "hour", tax_mode: "excluded" });
  assert.equal(t.total, null);
});

test("calcInvoice: no tax setting adds no tax", () => {
  const t = calcInvoice({ base_amount: 50000, amount_unit: "total", tax_mode: null, extra_amount: 1000 });
  assert.equal(t.tax, null);
  assert.equal(t.total, 51000);
});

test("bankError: all or nothing, digits, type", () => {
  assert.equal(bankError(null), null);
  assert.equal(bankError(bank), null);
  assert.ok(bankError({ ...bank, branch: "" }));
  assert.ok(bankError({ ...bank, number: "12" }));
  assert.ok(bankError({ ...bank, number: "12345678901" }));
  assert.ok(bankError({ ...bank, number: "12ab5678" }));
  assert.ok(bankError({ ...bank, type: "定期" }));
});

test("normalizeBank: empty is null", () => {
  assert.equal(normalizeBank({ bank: "", branch: " ", type: "", number: "", holder: "" }), null);
  assert.equal(normalizeBank(null), null);
  assert.equal(normalizeBank(bank)?.number, "1234567");
});

test("registrationError: T + 13 digits, optional", () => {
  assert.equal(registrationError(""), null);
  assert.equal(registrationError("T1234567890123"), null);
  assert.ok(registrationError("1234567890123"));
  assert.ok(registrationError("T123"));
  assert.ok(registrationError("t1234567890123"));
});

test("toHalfWidth", () => {
  assert.equal(toHalfWidth("Ｔ１２３４"), "T1234");
});

test("receiptError: count, type, size", () => {
  const ok = { name: "a.pdf", size: 1000, type: "application/pdf" };
  assert.equal(receiptError(ok, 0), null);
  assert.ok(receiptError(ok, 5));
  assert.ok(receiptError({ ...ok, type: "text/html" }, 0));
  assert.ok(receiptError({ ...ok, size: 5 * 1024 * 1024 }, 0));
  assert.ok(receiptError({ ...ok, size: 0 }, 0));
});

test("diffInvoices: lists only what changed", () => {
  const a = { base_amount: 20000, amount_unit: "hour", tax_mode: "excluded", quantity: 6, extra_amount: 2000, due_date: "2026-11-30", bank_info: bank, receipts: [] };
  const b = { ...a, quantity: 5, due_date: "2026-12-10", receipts: [{ path: "receipts/x/1", name: "ticket.pdf", size: 10, type: "application/pdf" }] };
  const d = diffInvoices(a, b);
  assert.deepEqual(d.map((x) => x.label), ["時間数・日数", "支払期限", "領収書"]);
  assert.equal(d[0].before, "6");
  assert.equal(d[2].before, "なし");
  assert.deepEqual(diffInvoices(a, a), []);
});

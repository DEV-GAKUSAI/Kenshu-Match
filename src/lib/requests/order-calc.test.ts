import { test } from "node:test";
import assert from "node:assert/strict";
import { calcOrder, diffOrders, normalizeItems } from "./order-calc.ts";

const base = { amount: 200000, amount_unit: "total", tax_mode: "excluded" };

test("税別 total: 10% added, rounded down", () => {
  const t = calcOrder(base);
  assert.equal(t.subtotal, 200000);
  assert.equal(t.tax, 20000);
  assert.equal(t.total, 220000);
  assert.equal(calcOrder({ ...base, amount: 12345 }).tax, 1234);
});
test("税込: tax is inside", () => {
  const t = calcOrder({ ...base, tax_mode: "included", amount: 110000 });
  assert.equal(t.total, 110000);
  assert.equal(t.tax, 10000);
  assert.equal(t.subtotal, 100000);
});
test("extra rows are added", () => {
  const t = calcOrder({ ...base, items: [{ name: "資料費", qty: 2, unit_price: 1500 }] });
  assert.equal(t.lines.length, 2);
  assert.equal(t.subtotal, 203000);
  assert.equal(t.total, 223300);
});
test("hourly price needs 数量", () => {
  const per = { amount: 15000, amount_unit: "hour", tax_mode: "excluded" };
  assert.equal(calcOrder(per).total, null);
  assert.ok(calcOrder(per).note);
  const t = calcOrder({ ...per, main_qty: 6 });
  assert.equal(t.lines[0].amount, 90000);
  assert.equal(t.total, 99000);
});
test("no tax mode: no tax", () => {
  const t = calcOrder({ ...base, tax_mode: null });
  assert.equal(t.tax, null);
  assert.equal(t.total, 200000);
});
test("bad rows are ignored", () => {
  assert.deepEqual(normalizeItems([{ name: "", qty: 1, unit_price: 1 }, { name: "a", qty: 0, unit_price: 1 }, { name: "ok", qty: 1, unit_price: 5.9 }, null, "x"]), [{ name: "ok", qty: 1, unit_price: 5 }]);
  assert.deepEqual(normalizeItems("x"), []);
});
test("diff between versions", () => {
  const a = { ...base, payment_terms: "", note: "A", items: [] };
  const b = { ...base, payment_terms: "月末締め翌月末払い", note: "A", items: [{ name: "交通費", qty: 1, unit_price: 2000 }] };
  const d = diffOrders(a, b);
  assert.deepEqual(d.map((x) => x.label), ["明細", "支払条件"]);
  assert.equal(d[1].before, "なし");
  assert.deepEqual(diffOrders(a, a), []);
});

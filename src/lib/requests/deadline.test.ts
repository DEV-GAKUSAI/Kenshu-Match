import test from "node:test";
import assert from "node:assert/strict";
import { deadlinePassed, deadlineShort, todayJst } from "./deadline.ts";

test("todayJst uses Japan time", () => {
  assert.equal(todayJst(new Date("2026-10-22T16:00:00Z")), "2026-10-23");
  assert.equal(todayJst(new Date("2026-10-22T14:59:00Z")), "2026-10-22");
});

test("deadline passes after the end of the day", () => {
  assert.equal(deadlinePassed(null), false);
  assert.equal(deadlinePassed("2026-10-22", new Date("2026-10-22T14:59:00Z")), false);
  assert.equal(deadlinePassed("2026-10-22", new Date("2026-10-22T15:00:00Z")), true);
});

test("short text", () => {
  assert.equal(deadlineShort("2026-10-05"), "10/5");
});

import { yesterdayJst } from "./deadline.ts";
test("yesterdayJst is the day before today in Japan time", () => {
  assert.equal(yesterdayJst(new Date("2026-10-26T01:00:00Z")), "2026-10-25");
  assert.equal(yesterdayJst(new Date("2026-10-25T16:00:00Z")), "2026-10-25");
  assert.equal(yesterdayJst(new Date("2026-10-31T15:30:00Z")), "2026-10-31");
});

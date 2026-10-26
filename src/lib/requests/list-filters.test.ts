import test from "node:test";
import assert from "node:assert/strict";
import { monthLabel, monthsOfDays, recruitState } from "./list-filters.ts";

const base = { status: "pending", publishState: "published", isBroadcast: true, deadlinePassed: false };

test("recruiting state", () => {
  assert.equal(recruitState(base), "open");
  assert.equal(recruitState({ ...base, deadlinePassed: true }), "closed");
  assert.equal(recruitState({ ...base, publishState: "paused" }), "paused");
  assert.equal(recruitState({ ...base, publishState: "paused", deadlinePassed: true }), "closed");
});
test("no recruiting state for drafts, direct, decided, cancelled", () => {
  assert.equal(recruitState({ ...base, publishState: "draft" }), null);
  assert.equal(recruitState({ ...base, isBroadcast: false }), null);
  for (const s of ["accepted", "cancelled", "completed"]) assert.equal(recruitState({ ...base, status: s }), null);
});
test("months of the schedule", () => {
  assert.deepEqual(monthsOfDays([{ date: "2026-11-03" }, { date: "2026-11-20" }, { date: "2026-12-01" }, { date: "" }, { date: "bad" }]), ["2026-11", "2026-12"]);
  assert.deepEqual(monthsOfDays([]), []);
  assert.equal(monthLabel("2026-11"), "2026年11月");
});

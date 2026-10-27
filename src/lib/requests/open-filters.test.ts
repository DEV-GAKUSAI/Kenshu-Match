import assert from "node:assert/strict";
import { test } from "node:test";

import { matchesAmount, matchesMineState, matchesOpenState, matchesPeriod, matchesRole, mineStateOf, roleNamesOf } from "./open-filters.ts";

const slots = [
  { id: "a", name: "メイン講師", headcount: 1 },
  { id: "b", name: "サブ講師", headcount: 2 },
];

test("roles: names collected once, matching by name", () => {
  assert.deepEqual(roleNamesOf([{ role_slots: slots }, { role_slots: [slots[1]] }, { role_slots: null }, {}]), ["メイン講師", "サブ講師"]);
  assert.equal(matchesRole(slots, "サブ講師"), true);
  assert.equal(matchesRole(slots, "アシスタント"), false);
  assert.equal(matchesRole(null, "サブ講師"), false);
  assert.equal(matchesRole(null, ""), true);
});

test("period: any dated day inside the range; undated requests do not match a period", () => {
  const days = [{ date: "2026-11-05" }, { date: "" }, { date: "2026-11-20" }];
  assert.equal(matchesPeriod(days, "", ""), true);
  assert.equal(matchesPeriod(days, "2026-11-01", "2026-11-10"), true);
  assert.equal(matchesPeriod(days, "2026-11-06", "2026-11-19"), false);
  assert.equal(matchesPeriod(days, "2026-11-20", ""), true);
  assert.equal(matchesPeriod(days, "", "2026-11-04"), false);
  assert.equal(matchesPeriod([{ date: "" }], "2026-11-01", ""), false);
  assert.equal(matchesPeriod([], "", "2026-12-01"), false);
});

test("amount: unit and minimum", () => {
  const hour = { budget: 12000, budget_unit: "hour" };
  const day = { budget: 80000, budget_unit: "day" };
  const range = { budget: 10000, budget_max: 15000, budget_mode: "range", budget_unit: "hour" };
  const talk = { budget: null, budget_mode: "negotiable", budget_unit: "hour" };
  assert.equal(matchesAmount(hour, "", 0), true);
  assert.equal(matchesAmount(day, "", 0), true);
  assert.equal(matchesAmount(day, "day", 0), true);
  assert.equal(matchesAmount(hour, "day", 0), false);
  assert.equal(matchesAmount(day, "day", 70000), true);
  assert.equal(matchesAmount(day, "day", 90000), false);
  // an amount without a unit compares hours only (as before)
  assert.equal(matchesAmount(hour, "", 10000), true);
  assert.equal(matchesAmount(day, "", 10000), false);
  // a range counts by its upper end; 応相談 never matches an amount
  assert.equal(matchesAmount(range, "hour", 14000), true);
  assert.equal(matchesAmount(range, "hour", 16000), false);
  assert.equal(matchesAmount(talk, "hour", 1000), false);
  assert.equal(matchesAmount(talk, "hour", 0), true);
  // old rows without a unit are per hour
  assert.equal(matchesAmount({ budget: 5000 }, "hour", 0), true);
});

test("open state", () => {
  assert.equal(matchesOpenState(false, "open"), true);
  assert.equal(matchesOpenState(true, "open"), false);
  assert.equal(matchesOpenState(true, "closed"), true);
  assert.equal(matchesOpenState(false, "closed"), false);
  assert.equal(matchesOpenState(true, ""), true);
});

test("applied requests grouped by the status on the card", () => {
  assert.equal(mineStateOf("quoted"), "selecting");
  assert.equal(mineStateOf("selected"), "decided");
  assert.equal(mineStateOf("completed"), "done");
  assert.equal(mineStateOf("rejected"), "ended");
  assert.equal(mineStateOf("not-selected"), "ended");
  assert.equal(mineStateOf("unknown"), null);
  assert.equal(matchesMineState("completed", ""), true);
  assert.equal(matchesMineState("completed", "decided"), false);
});

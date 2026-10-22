import test from "node:test";
import assert from "node:assert/strict";
import { cleanSlots, normalizeSlots, openSlots, progressSummary, slotCounts, slotsSummary, totalNeeded, totalRemaining } from "./roles.ts";

const slots = [
  { id: "a", name: "メイン講師", headcount: 1 },
  { id: "b", name: "サブ講師", headcount: 2 },
];

test("normalizeSlots skips bad rows", () => {
  assert.deepEqual(normalizeSlots(null), []);
  assert.deepEqual(normalizeSlots([{ id: "a", name: " メイン ", headcount: 1 }, { id: "", name: "x", headcount: 1 }, { id: "c", name: "y", headcount: 0 }, 5]), [
    { id: "a", name: "メイン", headcount: 1 },
  ]);
});

test("cleanSlots drops empty names and limits the headcount", () => {
  const out = cleanSlots([
    { id: "a", name: " メイン講師 ", headcount: "1" },
    { id: "b", name: "", headcount: 3 },
    { id: "c", name: "サブ", headcount: 999 },
    { id: "d", name: "助手", headcount: "abc" },
  ]);
  assert.deepEqual(out, [
    { id: "a", name: "メイン講師", headcount: 1 },
    { id: "c", name: "サブ", headcount: 50 },
    { id: "d", name: "助手", headcount: 1 },
  ]);
});

test("counts, remaining and summaries", () => {
  const responses = [
    { is_selected: true, role_slot_id: "a" },
    { is_selected: true, role_slot_id: "b" },
    { is_selected: false, role_slot_id: "b" },
  ];
  const counts = slotCounts(slots, responses);
  assert.deepEqual(counts.map((c) => [c.decided, c.remaining]), [[1, 0], [1, 1]]);
  assert.equal(totalRemaining(counts), 1);
  assert.equal(totalNeeded(slots), 3);
  assert.equal(slotsSummary(slots), "メイン講師 1名・サブ講師 2名");
  assert.equal(progressSummary(counts), "メイン講師 1/1・サブ講師 1/2");
  assert.deepEqual(openSlots(counts).map((s) => s.id), ["b"]);
});

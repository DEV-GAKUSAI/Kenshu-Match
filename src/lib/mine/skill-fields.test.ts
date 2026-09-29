import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeFieldName, planExpertiseSync, resolveSubcategoryIds } from "./skill-fields.ts";

const subs = [
  { id: "a", name: "Node.js" },
  { id: "b", name: "HTML・CSS" },
  { id: "c", name: "Python" },
  { id: "d", name: "その他" },
];

void test("normalises width, case, spaces and separators", () => {
  assert.equal(normalizeFieldName("Ｎode.JS"), normalizeFieldName("nodejs"));
  assert.equal(normalizeFieldName("HTML/CSS"), normalizeFieldName("HTML・CSS"));
});

void test("resolves only names that exist and never invents", () => {
  assert.deepEqual(resolveSubcategoryIds(["NodeJS", "HTML/CSS", "Rust"], subs), ["a", "b"]);
  assert.deepEqual(resolveSubcategoryIds([], subs), []);
});

void test("sync adds new, removes only previously-synced, keeps manual", () => {
  const plan = planExpertiseSync({ desired: ["a", "c"], existing: ["a", "x", "old"], previouslySynced: ["a", "old"] });
  assert.deepEqual(plan.toAdd, ["c"]);
  assert.deepEqual(plan.toRemove, ["old"]);
  assert.deepEqual(plan.syncedAfter, ["a", "c"]);
});

void test("a manually-added field that Mine also maps stays manual", () => {
  const plan = planExpertiseSync({ desired: ["a"], existing: ["a"], previouslySynced: [] });
  assert.deepEqual(plan.toAdd, []);
  assert.deepEqual(plan.syncedAfter, []);
});

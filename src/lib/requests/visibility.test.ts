import assert from "node:assert/strict";
import test from "node:test";

import { diffInvites, inviteError, normalizeVisibility } from "./visibility.ts";

test("old or unknown values count as public (existing requests stay public)", () => {
  assert.equal(normalizeVisibility(undefined), "public");
  assert.equal(normalizeVisibility("registered"), "registered");
  assert.equal(normalizeVisibility("invited"), "invited");
  assert.equal(normalizeVisibility("x"), "public");
});

test("diffInvites adds new ids and removes dropped ones", () => {
  assert.deepEqual(diffInvites(["a", "b"], ["b", "c"]), { add: ["c"], remove: ["a"] });
  assert.deepEqual(diffInvites([], ["a", "a"]), { add: ["a"], remove: [] });
  assert.deepEqual(diffInvites(["a"], []), { add: [], remove: ["a"] });
});

test("invited needs at least one instructor", () => {
  assert.ok(inviteError("invited", []));
  assert.equal(inviteError("invited", ["a"]), null);
  assert.equal(inviteError("registered", []), null);
});

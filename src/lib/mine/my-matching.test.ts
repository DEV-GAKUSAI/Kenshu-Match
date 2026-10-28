import assert from "node:assert/strict";
import test from "node:test";

import { applyMineToMatching, skillReasons, toolNamesOf, type MatchingProfile } from "./my-matching.ts";

const base: MatchingProfile = { workStyle: "ONSITE", desiredRateMin: 9000, expertiseIds: new Set(["f1"]), prefectures: ["大阪府"], skills: [] };

test("a lecturer linked to Mine gets Mine's values, even empty ones; the old columns are not used", () => {
  const out = applyMineToMatching(base, { linked: true, work_style: "ONLINE", hourly_rate: 8000, prefectures: ["東京都"], training_skills: [{ k: "tool", n: "Oracle", y: 5 }] });
  assert.equal(out.workStyle, "ONLINE");
  assert.equal(out.desiredRateMin, 8000);
  assert.deepEqual(out.prefectures, ["東京都"]);
  assert.deepEqual(out.skills, [{ k: "tool", n: "Oracle", y: 5 }]);
  assert.ok(out.expertiseIds.has("f1"));
  const empty = applyMineToMatching(base, { linked: true });
  assert.equal(empty.workStyle, null);
  assert.equal(empty.desiredRateMin, null);
  assert.deepEqual(empty.prefectures, []);
});

test("not linked, or Mine unreachable: the old values stay", () => {
  assert.equal(applyMineToMatching(base, { linked: false, work_style: "ONLINE" }), base);
  assert.equal(applyMineToMatching(base, null), base);
  assert.equal(applyMineToMatching(base, { linked: true, work_style: "MOON" }).workStyle, null);
});

test("skill reasons: the request's field and its ticked tools", () => {
  const skills = [{ k: "field" as const, n: "ネットワーク" }, { k: "tool" as const, n: "Oracle" }];
  assert.deepEqual(skillReasons("ネットワーク", ["Java", "Oracle"], skills), { field: true, tool: true });
  assert.deepEqual(skillReasons("クラウドインフラ", ["Java"], skills), { field: false, tool: false });
  assert.deepEqual(skillReasons(undefined, [], skills), { field: false, tool: false });
  assert.deepEqual(toolNamesOf(["a", "x", "b"], { a: "Oracle", b: "Java" }), ["Oracle", "Java"]);
});

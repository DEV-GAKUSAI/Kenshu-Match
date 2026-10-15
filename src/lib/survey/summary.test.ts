import assert from "node:assert/strict";
import test from "node:test";

import { applySurveySummary, surveyScoreLabel } from "./summary.ts";

test("only instructors with answers get the survey numbers", () => {
  const out = applySurveySummary([{ id: "a" }, { id: "b" }, { id: "c" }], { a: { avg: 3.6, count: 4 }, c: { avg: 0, count: 0 } });
  assert.deepEqual(out[0], { id: "a", survey_avg: 3.6, survey_count: 4 });
  assert.deepEqual(out[1], { id: "b" });
  assert.deepEqual(out[2], { id: "c" });
});

test("label", () => {
  assert.equal(surveyScoreLabel(3.6, 12), "研修評価 3.6（12件）");
  assert.equal(surveyScoreLabel(4, 1), "研修評価 4.0（1件）");
});

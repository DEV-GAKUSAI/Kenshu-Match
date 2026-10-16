import assert from "node:assert/strict";
import test from "node:test";

import { applySurveySummary, sortBySurveyAvg, surveyScoreLabel } from "./summary.ts";

test("only instructors with answers get the survey numbers", () => {
  const out = applySurveySummary([{ id: "a" }, { id: "b" }, { id: "c" }], { a: { avg: 3.6, count: 4 }, c: { avg: 0, count: 0 } });
  assert.deepEqual(out[0], { id: "a", survey_avg: 3.6, survey_count: 4 });
  assert.deepEqual(out[1], { id: "b" });
  assert.deepEqual(out[2], { id: "c" });
});

test("label", () => {
  assert.equal(surveyScoreLabel(3.6, 12), "3.6 / 4（12件）");
  assert.equal(surveyScoreLabel(4, 1), "4.0 / 4（1件）");
});

test("sorted by survey average, unrated last in original order", () => {
  const rows = [
    { id: "n1" },
    { id: "low", survey_avg: 2.5, survey_count: 9 },
    { id: "n2" },
    { id: "high", survey_avg: 3.8, survey_count: 2 },
    { id: "tieMore", survey_avg: 3.0, survey_count: 5 },
    { id: "tieLess", survey_avg: 3.0, survey_count: 1 },
  ];
  assert.deepEqual(sortBySurveyAvg(rows).map((r) => r.id), ["high", "tieMore", "tieLess", "low", "n1", "n2"]);
});

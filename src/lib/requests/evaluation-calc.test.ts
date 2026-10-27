import test from "node:test";
import assert from "node:assert/strict";

import { averageScore, EMPTY_EVAL, evaluationError, evaluationSummaryText, summarizeEvaluations, type EvalInput } from "./evaluation-calc.ts";

const ok: EvalInput = { expertise: 5, teaching: 4, preparation: 4, communication: 5, cooperation: 3, reuse: "yes", comment: "", evaluator_name: "田中" };

test("a complete form is fine", () => {
  assert.equal(evaluationError(ok), null);
});

test("every star item and the reuse answer are needed", () => {
  assert.match(evaluationError(EMPTY_EVAL) ?? "", /専門性/);
  assert.match(evaluationError({ ...ok, cooperation: 0 }) ?? "", /運営協力/);
  assert.match(evaluationError({ ...ok, teaching: 6 }) ?? "", /教え方/);
  assert.match(evaluationError({ ...ok, reuse: "" }) ?? "", /再依頼/);
});

test("evaluator name and comment limits", () => {
  assert.match(evaluationError({ ...ok, evaluator_name: "  " }) ?? "", /名前/);
  assert.match(evaluationError({ ...ok, evaluator_name: "あ".repeat(41) }) ?? "", /40/);
  assert.equal(evaluationError({ ...ok, comment: "あ".repeat(1000) }), null);
  assert.match(evaluationError({ ...ok, comment: "あ".repeat(1001) }) ?? "", /1000/);
});

test("average has one decimal", () => {
  assert.equal(averageScore(ok), 4.2);
  assert.equal(averageScore({ ...ok, expertise: 1, teaching: 1, preparation: 1, communication: 1, cooperation: 2 }), 1.2);
});

test("summary per lecturer", () => {
  const rows = [
    { instructor_id: "a", expertise: 5, teaching: 4, preparation: 4, communication: 5, cooperation: 3, reuse: "yes" },
    { instructor_id: "a", expertise: 3, teaching: 3, preparation: 3, communication: 3, cooperation: 3, reuse: "no" },
    { instructor_id: "b", expertise: 5, teaching: 5, preparation: 5, communication: 5, cooperation: 5, reuse: "maybe" },
  ];
  const s = summarizeEvaluations(rows);
  assert.deepEqual(s.a, { count: 2, avg: 3.6, reuseYes: 1, reuseNo: 1 });
  assert.deepEqual(s.b, { count: 1, avg: 5, reuseYes: 0, reuseNo: 0 });
  assert.equal(evaluationSummaryText(s.a), "依頼ごとの評価 ★3.6（2件）・ぜひ再依頼 1件・再依頼しない 1件");
  assert.equal(evaluationSummaryText(s.b), "依頼ごとの評価 ★5.0（1件）");
  assert.equal(evaluationSummaryText(undefined), null);
});

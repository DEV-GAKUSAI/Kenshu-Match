import test from "node:test";
import assert from "node:assert/strict";

import { PROGRESS_STEPS, progressIndex } from "./progress.ts";

const base = { status: "pending", applied: false, interviewReleased: false, decided: false };

test("steps are 応募 → 面談 → 決定 → 研修 → 完了", () => {
  assert.deepEqual([...PROGRESS_STEPS], ["応募", "面談", "決定", "研修", "完了"]);
});

test("current step follows what happened", () => {
  assert.equal(progressIndex(base), 0);
  assert.equal(progressIndex({ ...base, applied: true }), 1);
  assert.equal(progressIndex({ ...base, applied: true, interviewReleased: true }), 2);
  assert.equal(progressIndex({ ...base, applied: true, interviewReleased: true, decided: true }), 3);
  assert.equal(progressIndex({ ...base, status: "accepted", applied: true }), 3);
});

test("a decided role while the request is still recruiting is already 研修", () => {
  assert.equal(progressIndex({ ...base, applied: true, decided: true }), 3);
});

test("completed shows everything done; cancelled shows nothing", () => {
  assert.equal(progressIndex({ ...base, status: "completed" }), 5);
  assert.equal(progressIndex({ ...base, status: "cancelled", applied: true }), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { isManualStage, stageOf } from "./stage.ts";

test("selected wins over everything", () => {
  assert.equal(stageOf({ is_selected: true, stage: "passed" }, true), "selected");
});

test("closed request: not decided = passed", () => {
  assert.equal(stageOf({ is_selected: false }, true), "passed");
});

test("manual stages and the interview step", () => {
  assert.equal(stageOf({ action: "accept" }, false), "applied");
  assert.equal(stageOf({ stage: "screening" }, false), "screening");
  assert.equal(stageOf({ interview_status: "requested" }, false), "interview");
  assert.equal(stageOf({ interview_status: "released", stage: "screening" }, false), "interview");
  assert.equal(stageOf({ interview_status: "released", stage: "negotiation" }, false), "negotiation");
  assert.equal(stageOf({ interview_status: "released", stage: "passed" }, false), "passed");
});

test("isManualStage", () => {
  assert.equal(isManualStage("screening"), true);
  assert.equal(isManualStage("interview"), false);
  assert.equal(isManualStage(null), false);
});

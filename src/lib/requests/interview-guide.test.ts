import test from "node:test";
import assert from "node:assert/strict";
import { interviewGuide } from "./interview-guide.ts";

const base = { interview: null, decided: false, passed: false, canBook: false };

test("no interview yet: tells what to do and allows the request", () => {
  const g = interviewGuide(base);
  assert.equal(g.done, 1);
  assert.equal(g.canRequest, true);
  assert.match(g.hint ?? "", /面談を依頼する/);
  assert.match(g.hint ?? "", /予約での面談ができません/);
});

test("with booking available the hint mentions booking and the request", () => {
  const g = interviewGuide({ ...base, canBook: true });
  assert.match(g.hint ?? "", /予約するか/);
  assert.doesNotMatch(g.hint ?? "", /予約での面談ができません/);
  assert.equal(g.canRequest, true);
});

test("requested: waiting for the instructor, nothing to press", () => {
  const g = interviewGuide({ ...base, interview: "requested" });
  assert.deepEqual(g, { done: 2, hint: null, canRequest: false });
});

test("released: ready to decide", () => {
  const g = interviewGuide({ ...base, interview: "released" });
  assert.deepEqual(g, { done: 3, hint: null, canRequest: false });
});

test("declined: says so and offers no request", () => {
  const g = interviewGuide({ ...base, interview: "declined" });
  assert.equal(g.canRequest, false);
  assert.match(g.hint ?? "", /辞退/);
});

test("decided: all steps done", () => {
  const g = interviewGuide({ ...base, interview: "released", decided: true });
  assert.deepEqual(g, { done: 4, hint: null, canRequest: false });
});

test("passed (見送り) without interview: no hint and no request", () => {
  const g = interviewGuide({ ...base, passed: true });
  assert.deepEqual(g, { done: 1, hint: null, canRequest: false });
});

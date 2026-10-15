import assert from "node:assert/strict";
import test from "node:test";

import { isSurveyToken, linkStateMessage, parseSubmission, unansweredCount } from "./answers.ts";

const token = "a".repeat(64);
const good = { token, answers: { q1: 4, q2: 3, q3: 2, q4: 1, q5: 4 }, comment: "  よかった  ", name: " " };

test("a complete submission is cleaned", () => {
  const parsed = parseSubmission(good);
  assert.ok(parsed);
  assert.equal(parsed.comment, "よかった");
  assert.equal(parsed.name, null);
  assert.deepEqual(parsed.scores, { q1: 4, q2: 3, q3: 2, q4: 1, q5: 4 });
});

test("all five answers are required and must be 1 to 4", () => {
  assert.equal(parseSubmission({ ...good, answers: { q1: 4, q2: 3, q3: 2, q4: 1 } }), null);
  assert.equal(parseSubmission({ ...good, answers: { ...good.answers, q5: 5 } }), null);
  assert.equal(parseSubmission({ ...good, answers: { ...good.answers, q5: 0 } }), null);
  assert.equal(parseSubmission({ ...good, answers: { ...good.answers, q5: 2.5 } }), null);
  assert.equal(parseSubmission({ ...good, answers: { ...good.answers, q5: "3" } }), null);
});

test("token must look like a survey token", () => {
  assert.equal(isSurveyToken(token), true);
  assert.equal(isSurveyToken("abc"), false);
  assert.equal(isSurveyToken(undefined), false);
  assert.equal(parseSubmission({ ...good, token: "x" }), null);
});

test("comment and name have length limits", () => {
  assert.equal(parseSubmission({ ...good, comment: "あ".repeat(1001) }), null);
  assert.ok(parseSubmission({ ...good, comment: "あ".repeat(1000) }));
  assert.equal(parseSubmission({ ...good, name: "あ".repeat(41) }), null);
  assert.equal(parseSubmission({ ...good, comment: 5 }), null);
});

test("unansweredCount counts the questions left", () => {
  assert.equal(unansweredCount({}), 5);
  assert.equal(unansweredCount({ q1: 4, q2: 3 }), 3);
});

test("messages for each closed state", () => {
  assert.match(linkStateMessage("used"), /回答済み/);
  assert.match(linkStateMessage("closed"), /終了/);
  assert.match(linkStateMessage("invalid"), /無効/);
  assert.match(linkStateMessage("not_open", "2026-10-20T00:00:00+09:00"), /10月20日から/);
});

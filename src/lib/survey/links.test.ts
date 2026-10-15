import assert from "node:assert/strict";
import test from "node:test";

import { errorMessage, linkCap, surveyLinkUrl } from "./links.ts";

test("cap is 対象人数 plus 20 percent, rounded up", () => {
  assert.equal(linkCap(10), 12);
  assert.equal(linkCap(5), 6);
  assert.equal(linkCap(1), 2);
  assert.equal(linkCap(25), 30);
  assert.equal(linkCap(13), 16);
});

test("cap never drifts from exact 20 percent arithmetic", () => {
  for (let n = 1; n <= 2000; n++) assert.equal(linkCap(n), Math.ceil((n * 12) / 10));
});

test("link url", () => {
  assert.equal(surveyLinkUrl("https://a.example/", "tok"), "https://a.example/survey?t=tok");
});

test("database errors become plain messages", () => {
  assert.match(errorMessage("link_cap_exceeded", 12), /12件/);
  assert.match(errorMessage("participant_count_required", 0), /対象人数/);
  assert.match(errorMessage("something else", 0), /もう一度/);
});

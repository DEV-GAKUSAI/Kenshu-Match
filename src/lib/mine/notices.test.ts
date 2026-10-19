import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { buildNoticeBody, classifyStatus, retryDelayMinutes, signNotice } from "./notices.ts";

const row = { event_id: "5b0c8f0e-3d0a-4a1e-9d4c-1f2a3b4c5d6e", mine_user_id: "0f1e2d3c-4b5a-4968-8776-655443322110", event_code: "chosen" };

test("body carries only ids and a fixed code", () => {
  const body = JSON.parse(buildNoticeBody(row, new Date("2026-10-19T03:04:05.678Z")) as string);
  assert.deepEqual(body, {
    schema_version: 1,
    event_id: row.event_id,
    service: "kenshulink",
    type: "service_event",
    mine_user_id: row.mine_user_id,
    event_code: "chosen",
    occurred_at: "2026-10-19T03:04:05Z",
  });
});

test("unknown codes are not sent", () => {
  assert.equal(buildNoticeBody({ ...row, event_code: "hello" }, new Date()), null);
});

test("signature matches Mine's scheme", () => {
  const secret = "x".repeat(32);
  const expected = `v1=${createHmac("sha256", secret).update("1790730000.{}").digest("hex")}`;
  assert.equal(signNotice(secret, "1790730000", "{}"), expected);
});

test("status handling", () => {
  assert.equal(classifyStatus(200), "sent");
  assert.equal(classifyStatus(401), "drop");
  assert.equal(classifyStatus(422), "drop");
  assert.equal(classifyStatus(429), "retry");
  assert.equal(classifyStatus(503), "retry");
});

test("retry delay grows and is capped", () => {
  assert.equal(retryDelayMinutes(1), 2);
  assert.equal(retryDelayMinutes(3), 8);
  assert.equal(retryDelayMinutes(10), 60);
});

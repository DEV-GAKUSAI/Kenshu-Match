import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { createBookingTicket, formatMeetingTime, parseMeetingEvent, verifyMineMessage } from "./booking.ts";

const SECRET = "x".repeat(40);
const NOW = 1_790_000_000;

void test("booking ticket has Mine's format and a 30-minute life", () => {
  const token = createBookingTicket(
    { mineUserId: "11111111-1111-4111-8111-111111111111", org: " テスト株式会社 ", name: "山田", responseId: "22222222-2222-4222-8222-222222222222" },
    SECRET,
    NOW,
  );
  const [encoded, signature] = token.split(".");
  assert.equal(signature, createHmac("sha256", SECRET).update(encoded).digest("base64url"));
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  assert.equal(payload.typ, "mine_booking");
  assert.equal(payload.org, "テスト株式会社");
  assert.equal(payload.exp, NOW + 1800);
  assert.match(payload.nonce, /^[0-9a-f-]{36}$/);
  assert.equal("bid" in payload, false);
});

void test("a ticket carries the request id so Mine can link back to the 案件", () => {
  const token = createBookingTicket(
    {
      mineUserId: "11111111-1111-4111-8111-111111111111",
      org: "テスト株式会社",
      name: "",
      responseId: "22222222-2222-4222-8222-222222222222",
      requestId: "55555555-5555-4555-8555-555555555555",
    },
    SECRET,
    NOW,
  );
  const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
  assert.equal(payload.rid, "55555555-5555-4555-8555-555555555555");
});

void test("a ticket for changing a meeting carries Mine's booking id", () => {
  const token = createBookingTicket(
    {
      mineUserId: "11111111-1111-4111-8111-111111111111",
      org: "テスト株式会社",
      name: "",
      responseId: "22222222-2222-4222-8222-222222222222",
      bookingId: "44444444-4444-4444-8444-444444444444",
    },
    SECRET,
    NOW,
  );
  const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
  assert.equal(payload.bid, "44444444-4444-4444-8444-444444444444");
});

void test("Mine messages: valid signature and time only", () => {
  const body = '{"v":1}';
  const sign = (ts: number) => `v1=${createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex")}`;
  assert.equal(verifyMineMessage(body, String(NOW), sign(NOW), SECRET, NOW), true);
  assert.equal(verifyMineMessage(body + " ", String(NOW), sign(NOW), SECRET, NOW), false);
  assert.equal(verifyMineMessage(body, String(NOW - 400), sign(NOW - 400), SECRET, NOW), false);
  assert.equal(verifyMineMessage(body, String(NOW), sign(NOW), "y".repeat(40), NOW), false);
  assert.equal(verifyMineMessage(body, null, sign(NOW), SECRET, NOW), false);
});

const event = {
  v: 1,
  booking_id: "33333333-3333-4333-8333-333333333333",
  mine_user_id: "11111111-1111-4111-8111-111111111111",
  response_id: "22222222-2222-4222-8222-222222222222",
  title: "面談",
  starts_at: "2026-10-12T01:00:00+00:00",
  ends_at: "2026-10-12T01:30:00+00:00",
  time_zone: "Asia/Tokyo",
  meeting_type: "google_meet",
  meeting_url: "https://meet.google.com/abc-defg-hij",
  meeting_status: "ready",
  place: null,
  status: "confirmed",
  proposed_starts_at: null,
  proposed_ends_at: null,
  proposed_by: null,
  change_reason: null,
  version: "2026-10-09T08:00:00.000000Z",
};

void test("meeting events are validated strictly", () => {
  assert.equal(parseMeetingEvent(event)?.meeting_url, "https://meet.google.com/abc-defg-hij");
  assert.equal(parseMeetingEvent({ ...event, meeting_url: "javascript:alert(1)" }), null);
  assert.equal(parseMeetingEvent({ ...event, status: "deleted" }), null);
  assert.equal(parseMeetingEvent({ ...event, ends_at: event.starts_at }), null);
  assert.equal(parseMeetingEvent({ ...event, v: 2 }), null);
  // The reason for a time change: optional, trimmed, up to 500 characters.
  assert.equal(parseMeetingEvent(event)?.change_reason, null);
  assert.equal(parseMeetingEvent({ ...event, change_reason: "  都合により  " })?.change_reason, "都合により");
  assert.equal(parseMeetingEvent({ ...event, change_reason: "   " })?.change_reason, null);
  assert.equal(parseMeetingEvent({ ...event, change_reason: "あ".repeat(501) }), null);
  assert.equal(parseMeetingEvent({ ...event, change_reason: 5 }), null);
  assert.equal(formatMeetingTime(event.starts_at, event.ends_at, "Asia/Tokyo"), "10月12日(月) 10:00〜10:30");
});

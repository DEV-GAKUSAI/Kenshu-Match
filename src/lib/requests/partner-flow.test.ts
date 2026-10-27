import test from "node:test";
import assert from "node:assert/strict";

import {
  canPropose,
  countProposals,
  formatInviteCode,
  inviteLink,
  inviteMessage,
  inviteLeftText,
  inviteReasonText,
  isCompleteInviteCode,
  normalizeInviteCode,
  partnerErrorText,
  partnerRoleText,
  proposalStatusText,
} from "./partner-flow.ts";

test("invite code: typed, pasted and spaced input all become the stored code", () => {
  assert.equal(normalizeInviteCode(" k7m2 - 9qxa "), "K7M29QXA");
  assert.equal(normalizeInviteCode("K7M2-9QXA-EXTRA"), "K7M29QXA");
  assert.equal(normalizeInviteCode("あいう"), "");
});

test("invite code is shown with a dash after four characters", () => {
  assert.equal(formatInviteCode("K7M29QXA"), "K7M2-9QXA");
  assert.equal(formatInviteCode("k7m2"), "K7M2");
  assert.equal(formatInviteCode(""), "");
});

test("a code is complete only with 8 characters", () => {
  assert.equal(isCompleteInviteCode("K7M2-9QXA"), true);
  assert.equal(isCompleteInviteCode("K7M2-9QX"), false);
});

test("time left of an invitation", () => {
  const now = new Date("2026-10-27T00:00:00Z").getTime();
  assert.equal(inviteLeftText("2026-11-03T00:00:00Z", now), "あと7日");
  assert.equal(inviteLeftText("2026-11-02T23:00:00Z", now), "あと6日");
  assert.equal(inviteLeftText("2026-10-27T05:30:00Z", now), "あと5時間");
  assert.equal(inviteLeftText("2026-10-27T00:20:00Z", now), "あと1時間未満");
  assert.equal(inviteLeftText("2026-10-26T23:59:00Z", now), "期限切れ");
  assert.equal(inviteLeftText("broken", now), "期限切れ");
});

test("role and status words", () => {
  assert.equal(partnerRoleText("contract"), "契約先");
  assert.equal(partnerRoleText("via"), "間に入る関係先");
  assert.equal(partnerRoleText(null), "関係先");
  assert.equal(proposalStatusText("accepted"), "採用されました");
  assert.equal(proposalStatusText("withdrawn"), "取り下げ済み");
  assert.equal(proposalStatusText("whatever"), "確認待ち");
});

test("every invite problem has its own message", () => {
  const reasons = ["invalid_code", "code_used", "code_expired", "own_code", "too_many_attempts"];
  const texts = new Set(reasons.map(inviteReasonText));
  assert.equal(texts.size, reasons.length);
  assert.match(inviteReasonText("other"), /連携できませんでした/);
});

test("database error codes become readable messages", () => {
  for (const c of ["not_authenticated", "not_company", "not_a_company", "not_found", "request_closed", "bad_name", "bad_note", "not_an_instructor", "too_many", "already_decided"]) {
    assert.notEqual(partnerErrorText(c), partnerErrorText("unknown"), c);
  }
  assert.match(partnerErrorText(undefined), /処理できませんでした/);
});

test("proposal counts and the closed-request rule", () => {
  assert.deepEqual(countProposals([{ status: "new" }, { status: "new" }, { status: "accepted" }, { status: "x" }]), { new: 2, accepted: 1, passed: 0, withdrawn: 0 });
  assert.equal(canPropose("pending"), true);
  assert.equal(canPropose("accepted"), true);
  assert.equal(canPropose("cancelled"), false);
  assert.equal(canPropose("completed"), false);
});

test("the invitation link carries the normalized code", () => {
  assert.equal(inviteLink("https://kenshu-match.vercel.app/", "xt9q-5yh7"), "https://kenshu-match.vercel.app/partner-invite?code=XT9Q5YH7");
  assert.equal(inviteLink("https://example.com", "K7M29QXA"), "https://example.com/partner-invite?code=K7M29QXA");
});

test("the invitation message holds code, time left, link and the sign-up hint", () => {
  const m = inviteMessage("https://example.com", "K7M29QXA", "あと7日");
  assert.match(m, /K7M2-9QXA（あと7日・1回だけ使えます）/);
  assert.match(m, /https:\/\/example\.com\/partner-invite\?code=K7M29QXA/);
  assert.match(m, /新規登録/);
  assert.equal(m.split("\n").length, 4);
});

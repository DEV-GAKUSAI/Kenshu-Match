import test from "node:test";
import assert from "node:assert/strict";
import { nextAction, type NextActionApplicant } from "./next-action.ts";

const app = (o: Partial<NextActionApplicant> = {}): NextActionApplicant => ({ isNew: false, interview: null, passed: false, decided: false, ...o });
const base = { statusKey: "quoted", isDraft: false, isBroadcast: true, deadlinePassed: false, applicants: [] as NextActionApplicant[] };

test("nothing for cancelled, completed or rejected", () => {
  for (const k of ["cancelled", "completed", "rejected"]) assert.equal(nextAction({ ...base, statusKey: k }), null);
});
test("draft, decided, direct requests", () => {
  assert.equal(nextAction({ ...base, statusKey: "pending", isDraft: true }), "公開する");
  assert.equal(nextAction({ ...base, statusKey: "accepted" }), "実施後に研修完了へ");
  assert.equal(nextAction({ ...base, statusKey: "pending", isBroadcast: false }), "講師の返答待ち");
  assert.equal(nextAction({ ...base, statusKey: "quoted", isBroadcast: false }), "見積りの確認・確定");
});
test("no applicants: waiting, or deadline passed", () => {
  assert.equal(nextAction({ ...base, statusKey: "pending" }), "応募待ち");
  assert.equal(nextAction({ ...base, statusKey: "pending", deadlinePassed: true }), "締切を延ばすか取消");
});
test("applicants: new, ask for interview, wait for release, decide", () => {
  assert.equal(nextAction({ ...base, applicants: [app({ isNew: true }), app({ isNew: true })] }), "応募の確認（NEW 2名）");
  assert.equal(nextAction({ ...base, applicants: [app()] }), "面談を依頼する");
  assert.equal(nextAction({ ...base, applicants: [app({ interview: "requested" })] }), "講師の情報公開待ち");
  assert.equal(nextAction({ ...base, applicants: [app({ interview: "requested" }), app({ interview: "released" })] }), "講師を決定する");
});
test("role slots: decided applicants are ignored; passed or declined only means rethink", () => {
  assert.equal(nextAction({ ...base, applicants: [app({ decided: true, interview: "released" })] }), "応募待ち");
  assert.equal(nextAction({ ...base, applicants: [app({ passed: true }), app({ interview: "declined" })] }), "応募者の検討");
});

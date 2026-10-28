import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answersFor, areaState, isRecommendedMatch, referenceNote, withAreaReason, checkProfile, checkResponse, checksText, conditionLabel, normalizeAnswers, normalizeConditions, onSitePrefectures, summarizeChecks,
} from "./conditions.ts";

test("normalizeConditions keeps known keys once, in order, and checks years", () => {
  const out = normalizeConditions([
    { key: "daily", level: "nice" },
    { key: "years", level: "must", years: 3 },
    { key: "daily", level: "must" },
    { key: "weird", level: "must" },
    { key: "mock" },
    { key: "years", level: "nice", years: 9 },
  ]);
  assert.deepEqual(out.map((c) => c.key), ["years", "mock", "daily"]);
  assert.equal(out[0].years, 3);
  assert.equal(out[1].level, "must"); // default
  assert.equal(out[2].level, "nice");
  assert.deepEqual(normalizeConditions(null), []);
  assert.deepEqual(normalizeConditions([{ key: "years", years: 0 }, { key: "years", years: 1.5 }, { key: "years", years: 61 }]), []);
});

test("normalizeAnswers and answersFor drop unknown keys and values", () => {
  assert.deepEqual(normalizeAnswers({ years: "yes", mock: "maybe", daily: "no", other: "yes" }), { years: "yes", daily: "no" });
  assert.deepEqual(normalizeAnswers([1]), {});
  const conds = normalizeConditions([{ key: "mock", level: "must" }]);
  assert.deepEqual(answersFor(conds, { mock: "talk", daily: "yes" }), { mock: "talk" });
});

test("checkResponse: 全日程, answers, existing apply columns", () => {
  const req = {
    all_days_required: true,
    req_conditions: [
      { key: "mock", level: "must" },
      { key: "daily", level: "nice" },
      { key: "materials", level: "must" },
      { key: "prep_training", level: "must" },
    ],
  };
  const checks = checkResponse(req, { apply_all_days: "partial", apply_materials: "create", apply_prep: "discuss", condition_answers: { mock: "yes", daily: "no" } });
  const by = Object.fromEntries(checks.map((c) => [c.key, c.state]));
  assert.deepEqual(by, { alldays: "ng", materials: "ok", mock: "ok", prep_training: "unknown", daily: "ng" });
  assert.equal(checksText(checks), "必須条件：確認済み2・未確認1・不一致1");
  const s = summarizeChecks(checks);
  assert.deepEqual(s, { mustOk: 2, mustNg: 1, mustUnknown: 1, niceNg: 1 });
});

test("要相談 and no answer are both 未確認", () => {
  const req = { req_conditions: [{ key: "kickoff", level: "must" }, { key: "mock", level: "must" }] };
  const checks = checkResponse(req, { condition_answers: { kickoff: "talk" } });
  assert.deepEqual(checks.map((c) => c.state), ["unknown", "unknown"]);
});

test("経験年数 uses the answer first, then the profile", () => {
  const req = { req_conditions: [{ key: "years", level: "must", years: 3 }] };
  assert.equal(checkResponse(req, {}, { years_of_experience: 5 })[0].state, "ok");
  assert.equal(checkResponse(req, {}, { years_of_experience: 2 })[0].state, "ng");
  assert.equal(checkResponse(req, {}, { years_of_experience: null })[0].state, "unknown");
  assert.equal(checkResponse(req, { condition_answers: { years: "yes" } }, { years_of_experience: 2 })[0].state, "ok");
  assert.equal(conditionLabel({ key: "years", level: "must", years: 3 }), "経験3年以上");
});

test("checkProfile: only years can be known without an application", () => {
  const req = { all_days_required: true, req_conditions: [{ key: "years", level: "must", years: 3 }, { key: "mock", level: "must" }] };
  const checks = checkProfile(req, { years_of_experience: 4 });
  assert.deepEqual(Object.fromEntries(checks.map((c) => [c.key, c.state])), { alldays: "unknown", years: "ok", mock: "unknown" });
});

test("checksText is null when there is no 必須 condition", () => {
  assert.equal(checksText(checkResponse({ req_conditions: [{ key: "daily", level: "nice" }] }, {})), null);
  assert.equal(checksText([]), null);
});

test("area rule", () => {
  const onsite = { schedule_days: [{ format: "offline", prefecture: "東京都" }] };
  assert.deepEqual(onSitePrefectures(onsite), ["東京都"]);
  assert.equal(areaState(onsite, ["東京都", "大阪府"]), "ok");
  assert.equal(areaState(onsite, ["大阪府"]), "ng");
  assert.equal(areaState(onsite, []), "na");
  assert.equal(areaState(onsite, null), "na");
  assert.equal(areaState(onsite, ["オンライン対応（全国）"]), "na");
  assert.equal(areaState({ schedule_days: [{ format: "online", prefecture: "東京都" }] }, ["大阪府"]), "na");
  assert.equal(areaState({ schedule_days: [] }, ["大阪府"]), "na");
  const mixed = { schedule_days: [{ format: "offline", prefecture: "東京都" }, { format: "offline", prefecture: "大阪府" }] };
  assert.equal(areaState(mixed, ["大阪府"]), "ok");
});

test("おすすめ needs the field and a place that is not 不一致", () => {
  assert.equal(isRecommendedMatch(["分野", "形態"], "ok"), true);
  assert.equal(isRecommendedMatch(["分野"], "na"), true);
  assert.equal(isRecommendedMatch(["分野", "形態"], "ng"), false);
  assert.equal(isRecommendedMatch(["形態", "予算"], "ok"), false);
  assert.deepEqual(withAreaReason(["分野"], "ok"), ["分野", "エリア"]);
  assert.deepEqual(withAreaReason([], "ok"), []); // area alone never matches
  assert.deepEqual(withAreaReason(["分野"], "ng"), ["分野"]);
  assert.equal(referenceNote(["分野"], "ok"), null);
  assert.ok(referenceNote(["分野"], "ng")?.includes("対応エリア"));
  assert.ok(referenceNote(["形態"], "ok")?.includes("分野は一致していません"));
});

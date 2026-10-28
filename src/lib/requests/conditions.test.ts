import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answersFor, areaState, isRecommendedMatch, referenceNote, withAreaReason, checkProfile, checkResponse, checksText, conditionLabel, normalizeAnswers, normalizeConditions, onSitePrefectures, summarizeChecks, normalizeSkillItems, pruneSkillConditions, skillState } from "./conditions.ts";

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

test("分野・ツールの条件は保存・整形される（種類・名前・年数・登壇実績、重複なし）", () => {
  const list = normalizeConditions([
    { key: "years", level: "must", years: 3 },
    { key: "skill", level: "must", kind: "tool", name: "Oracle", years: 3, spoke: true },
    { key: "skill", level: "nice", kind: "field", name: "データベース基礎・SQL・設計・運用", years: 5 },
    { key: "skill", level: "must", kind: "tool", name: "Oracle" },
    { key: "skill", level: "must", kind: "other", name: "X" },
    { key: "skill", level: "must", kind: "tool", name: "  " },
    { key: "skill", level: "must", kind: "tool", name: "Java", years: 99 },
  ]);
  assert.deepEqual(list, [
    { key: "years", level: "must", years: 3 },
    { key: "skill", level: "must", kind: "tool", name: "Oracle", years: 3, spoke: true },
    { key: "skill", level: "nice", kind: "field", name: "データベース基礎・SQL・設計・運用", years: 5 },
    { key: "skill", level: "must", kind: "tool", name: "Java" },
  ]);
  assert.equal(normalizeConditions(Array.from({ length: 40 }, (_, i) => ({ key: "skill", level: "must", kind: "tool", name: `T${i}` }))).length, 30);
});

test("講師の保存リストの整形", () => {
  assert.deepEqual(normalizeSkillItems([{ k: "tool", n: "Oracle", y: 5, t: true }, { k: "tool", n: "Oracle" }, { k: "x", n: "A" }, { k: "field", n: "ネットワーク", y: "a" }, null]), [
    { k: "tool", n: "Oracle", y: 5, t: true },
    { k: "field", n: "ネットワーク" },
  ]);
  assert.deepEqual(normalizeSkillItems(undefined), []);
});

test("skillState: no list = 未確認, listed without the item = 不一致, years and 登壇実績 decide", () => {
  const oracle = { key: "skill" as const, level: "must" as const, kind: "tool" as const, name: "Oracle", years: 3, spoke: true };
  assert.equal(skillState(oracle, []), "unknown");
  assert.equal(skillState(oracle, [{ k: "tool", n: "Java" }]), "ng");
  assert.equal(skillState(oracle, [{ k: "tool", n: "Oracle", y: 5, t: true }]), "ok");
  assert.equal(skillState(oracle, [{ k: "tool", n: "Oracle", y: 2, t: true }]), "ng");
  assert.equal(skillState(oracle, [{ k: "tool", n: "Oracle", y: 5 }]), "ng");
  assert.equal(skillState(oracle, [{ k: "tool", n: "Oracle", t: true }]), "unknown");
  assert.equal(skillState({ ...oracle, years: undefined, spoke: undefined }, [{ k: "tool", n: "Oracle" }]), "ok");
  const sql = { key: "skill" as const, level: "must" as const, kind: "field" as const, name: "データベース基礎・SQL・設計・運用", years: 3 };
  assert.equal(skillState(sql, [], ["データベース基礎・SQL・設計・運用"]), "unknown"); // listed in Kenshu Link, but no years
  assert.equal(skillState({ ...sql, years: undefined }, [], ["データベース基礎・SQL・設計・運用"]), "ok");
});

test("checkProfile uses the saved list: SQL years, Oracle 登壇実績, all days (her test case)", () => {
  const req = {
    all_days_required: true,
    req_conditions: [
      { key: "skill", level: "must", kind: "field", name: "データベース基礎・SQL・設計・運用", years: 3 },
      { key: "skill", level: "must", kind: "tool", name: "Oracle", spoke: true },
    ],
  };
  const good = checkProfile(req, { training_skills: [{ k: "field", n: "データベース基礎・SQL・設計・運用", y: 4 }, { k: "tool", n: "Oracle", t: true }] });
  assert.deepEqual(good.map((c) => c.state), ["unknown", "ok", "ok"]); // 全日程 is only known from the application
  assert.equal(good[1].label, "データベース基礎・SQL・設計・運用（3年以上）");
  assert.equal(good[2].label, "Oracle（登壇実績）");
  const weak = checkProfile(req, { training_skills: [{ k: "field", n: "データベース基礎・SQL・設計・運用", y: 1 }] });
  assert.deepEqual(weak.map((c) => c.state), ["unknown", "ng", "ng"]);
  assert.deepEqual(checkProfile(req, {}).map((c) => c.state), ["unknown", "unknown", "unknown"]);
});

test("a 分野・ツール condition is dropped when its tool is no longer chosen", () => {
  const list = normalizeConditions([
    { key: "years", level: "must", years: 2 },
    { key: "skill", level: "must", kind: "tool", name: "Oracle", years: 3 },
    { key: "skill", level: "nice", kind: "tool", name: "Java" },
    { key: "skill", level: "must", kind: "field", name: "ネットワーク" },
  ]);
  const kept = pruneSkillConditions(list, [{ kind: "tool", name: "Java" }, { kind: "field", name: "ネットワーク" }]);
  assert.deepEqual(kept.map((c) => c.name ?? c.key), ["years", "Java", "ネットワーク"]);
});

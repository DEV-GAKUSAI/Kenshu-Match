import assert from "node:assert/strict";
import test from "node:test";

import { totalExperienceLabel, educationLine, formatYearMonth, initialsFromName, qualificationLine, skillLine, workHistoryLine } from "./public-profile.ts";

test("initials: first letter of each part, with dots", () => {
  assert.equal(initialsFromName("Alamgir Hossain"), "A.H.");
  assert.equal(initialsFromName("山田　太郎"), "山.太.");
  assert.equal(initialsFromName("  "), "");
  assert.equal(initialsFromName(null), "");
});

test("lines skip empty parts", () => {
  assert.equal(formatYearMonth("2024-04-01"), "2024年4月");
  assert.equal(skillLine({ name: "Java", level: 3, level_label: "実務", years: 2 }), "Java・レベル3｜実務・2年");
  assert.equal(skillLine({ name: "Go" }), "Go");
  assert.equal(qualificationLine({ name: "基本情報技術者", organization: "IPA", obtained_date: "2023-12-01" }), "基本情報技術者・IPA・2023年12月取得");
  assert.equal(workHistoryLine({ position: "講師", employment_type: "FREELANCE", start_date: "2020-04-01", is_current: true }), "講師・フリーランス・2020年4月 〜 現在");
  assert.equal(workHistoryLine({ company_name: "Gakusai", start_date: "2026-04-01", is_current: true }), "Gakusai・2026年4月 〜 現在");
  assert.equal(workHistoryLine({}), "（内容未入力）");
  assert.equal(educationLine({ school_name: "東京大学", degree: "学士" }), "東京大学・学士");
});

test("total experience counts months once and includes the first and last month", () => {
  const now = new Date(2026, 9, 15); // October 2026
  assert.equal(totalExperienceLabel([], now), "");
  assert.equal(totalExperienceLabel(undefined, now), "");
  assert.equal(totalExperienceLabel([{ start_date: "2025-04-01", end_date: "2026-03-01" }], now), "約1年");
  assert.equal(totalExperienceLabel([{ start_date: "2025-04-01", end_date: "2026-03-01" }, { start_date: "2026-04-01", is_current: true }], now), "約1年7ヶ月");
  // overlapping entries are not counted twice
  assert.equal(totalExperienceLabel([{ start_date: "2024-01-01", end_date: "2024-06-01" }, { start_date: "2024-04-01", end_date: "2024-09-01" }], now), "約9ヶ月");
  assert.equal(totalExperienceLabel([{ company_name: "x" }], now), "");
});

import assert from "node:assert/strict";
import test from "node:test";

import { educationLine, formatYearMonth, initialsFromName, qualificationLine, skillLine, workHistoryLine } from "./public-profile.ts";

test("initials: first letter of each part, with dots", () => {
  assert.equal(initialsFromName("Alamgir Hossain"), "A.H.");
  assert.equal(initialsFromName("山田　太郎"), "山.太.");
  assert.equal(initialsFromName("  "), "");
  assert.equal(initialsFromName(null), "");
});

test("lines are built without company names and skip empty parts", () => {
  assert.equal(formatYearMonth("2024-04-01"), "2024年4月");
  assert.equal(skillLine({ name: "Java", level: 3, level_label: "実務", years: 2 }), "Java・レベル3｜実務・2年");
  assert.equal(skillLine({ name: "Go" }), "Go");
  assert.equal(qualificationLine({ name: "基本情報技術者", organization: "IPA", obtained_date: "2023-12-01" }), "基本情報技術者・IPA・2023年12月取得");
  assert.equal(workHistoryLine({ position: "講師", employment_type: "FREELANCE", start_date: "2020-04-01", is_current: true }), "講師・フリーランス・2020年4月 〜 現在");
  assert.equal(workHistoryLine({}), "（内容未入力）");
  assert.equal(educationLine({ school_name: "東京大学", degree: "学士" }), "東京大学・学士");
});

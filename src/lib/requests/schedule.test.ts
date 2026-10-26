import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDays, dayLine, normalizeDays, validateDays, allDaysWarning, EMPTY_DAY } from "./schedule.ts";

test("normalizeDays is safe with bad input", () => {
  assert.deepEqual(normalizeDays(null), []);
  assert.deepEqual(normalizeDays("x"), []);
  const out = normalizeDays([{ date: "2026-11-02", format: "weird", place: 5 }]);
  assert.equal(out[0].format, "undecided");
  assert.equal(out[0].place, "");
});

test("cleanDays drops empty rows", () => {
  assert.equal(cleanDays([EMPTY_DAY, { ...EMPTY_DAY, date: "2026-11-02" }]).length, 1);
});

test("dayLine", () => {
  const line = dayLine({ date: "2026-11-02", start: "10:00", end: "17:00", format: "offline", place: "東京本社", content: "基礎" });
  assert.ok(line.includes("10:00〜17:00"));
  assert.ok(line.includes("対面・東京本社"));
  assert.ok(line.endsWith("基礎"));
  assert.equal(dayLine(EMPTY_DAY), "日付未定 時間未定 ／ 形態未定");
});

import { requestFormatLabel } from "./schedule.ts";

test("format tag says both when the days mix online and on-site", () => {
  const days = [{ format: "online" }, { format: "offline" }];
  assert.equal(requestFormatLabel({ preferred_format: "online", schedule_days: days }), "オンライン・対面 両方");
  assert.equal(requestFormatLabel({ preferred_format: "online", schedule_days: [{ format: "online" }] }), "オンライン");
  assert.equal(requestFormatLabel({ preferred_format: "offline", schedule_days: [] }), "対面");
});

test("validateDays: end after start, break needs both times and sits inside the day", () => {
  const day = { ...EMPTY_DAY, date: "2026-11-02", start: "09:00", end: "17:00" };
  assert.equal(validateDays([day]), null);
  assert.equal(validateDays([EMPTY_DAY]), null);
  assert.match(validateDays([{ ...day, start: "09:00", end: "08:00" }]) ?? "", /1日目：終了時刻/);
  assert.match(validateDays([day, { ...day, start: "10:00", end: "10:00" }]) ?? "", /2日目：終了時刻/);
  assert.match(validateDays([{ ...day, breakStart: "12:00" }]) ?? "", /両方/);
  assert.match(validateDays([{ ...day, breakStart: "13:00", breakEnd: "12:00" }]) ?? "", /休憩の終了/);
  assert.match(validateDays([{ ...day, breakStart: "08:00", breakEnd: "08:30" }]) ?? "", /時間内/);
  assert.match(validateDays([{ ...day, breakStart: "16:30", breakEnd: "17:30" }]) ?? "", /時間内/);
  assert.equal(validateDays([{ ...day, breakStart: "12:00", breakEnd: "13:00" }]), null);
  assert.match(validateDays([{ ...day, start: "9am" }]) ?? "", /形式/);
});

test("dayLine shows 休憩 and 調整中; old saved days (no such fields) still read the same", () => {
  const day = { ...EMPTY_DAY, date: "2026-11-02", start: "09:00", end: "17:00", format: "online" as const, breakStart: "12:00", breakEnd: "13:00", tentative: true };
  const line = dayLine(day);
  assert.ok(line.includes("休憩 12:00〜13:00"));
  assert.ok(line.endsWith("調整中"));
  const old = normalizeDays([{ date: "2026-11-02", start: "09:00", end: "17:00", format: "online", place: "", content: "" }]);
  assert.equal(old[0].tentative, false);
  assert.ok(!dayLine(old[0]).includes("調整中"));
});

test("allDaysWarning: only for all-days-required requests; counts partial and unanswered", () => {
  assert.equal(allDaysWarning(false, ["partial", null]), null);
  assert.equal(allDaysWarning(true, []), null);
  assert.equal(allDaysWarning(true, ["all", "all"]), null);
  assert.equal(allDaysWarning(true, ["all", "partial"]), "全日程必須：一部の日程のみ 1名");
  assert.equal(allDaysWarning(true, ["none", "partial", null, undefined, "all"]), "全日程必須：一部の日程のみ 2名・全日程の可否が未回答 2名");
});

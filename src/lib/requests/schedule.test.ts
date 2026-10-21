import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDays, dayLine, normalizeDays, EMPTY_DAY } from "./schedule.ts";

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

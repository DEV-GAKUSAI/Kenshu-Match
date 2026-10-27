import assert from "node:assert/strict";
import { test } from "node:test";

import { applyDiff } from "./apply-diff.ts";

test("no difference gives an empty list", () => {
  const a = { all_days: "all", role: "メイン", experience: "10年", materials: "existing", prep: "yes" };
  assert.deepEqual(applyDiff(a, { ...a }), []);
  assert.deepEqual(applyDiff(null, null), []);
  assert.deepEqual(applyDiff({ role: "  " }, { role: null }), []);
});

test("choices are shown in words", () => {
  const d = applyDiff({ all_days: "partial", prep: null }, { all_days: "all", prep: "discuss" });
  assert.deepEqual(d, [
    { label: "全日程への対応", before: "一部の日程のみ", after: "全日程OK" },
    { label: "事前研修への参加", before: "未入力", after: "要相談" },
  ]);
});

test("text answers and a removed answer", () => {
  const d = applyDiff({ role: "サブ", experience: "20回" }, { role: "メイン", experience: "" });
  assert.deepEqual(d, [
    { label: "希望する役割", before: "サブ", after: "メイン" },
    { label: "関連する実績", before: "20回", after: "未入力" },
  ]);
});

test("old history rows without a snapshot show nothing", () => {
  assert.deepEqual(applyDiff(null, { role: "メイン" }).length, 1);
  assert.deepEqual(applyDiff(undefined, undefined), []);
});

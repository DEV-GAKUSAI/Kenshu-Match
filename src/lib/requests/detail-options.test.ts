import { test } from "node:test";
import assert from "node:assert/strict";
import { groupChosen, summarizeChosen, type DetailOption } from "./detail-options.ts";

const opts: DetailOption[] = [
  { id: "a", group_key: "audience", name: "新入社員", sort_order: 2 },
  { id: "b", group_key: "tool", name: "Oracle", sort_order: 12 },
  { id: "c", group_key: "level", name: "入門", sort_order: 1 },
  { id: "d", group_key: "language", name: "日本語", sort_order: 1 },
];

test("groups chosen options in the sheet order and ignores unknown ids", () => {
  const g = groupChosen(["c", "a", "zzz", "b"], opts);
  assert.deepEqual(g.map((x) => x.label), ["対象者", "技術・製品・ツール", "研修レベル"]);
});

test("summary joins names, adds typed tools, and shortens long lists", () => {
  assert.equal(summarizeChosen(["a", "b", "c"], opts), "新入社員・Oracle・入門");
  assert.equal(summarizeChosen(["a"], opts, "Salesforce"), "新入社員・Salesforce");
  assert.equal(summarizeChosen(["a", "b", "c", "d"], opts, "X", 3), "新入社員・Oracle・入門 ほか2件");
  assert.equal(summarizeChosen([], opts), "");
});

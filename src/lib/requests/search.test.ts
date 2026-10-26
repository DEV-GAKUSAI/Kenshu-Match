import test from "node:test";
import assert from "node:assert/strict";
import { matchesSearch } from "./search.ts";

test("empty query matches everything", () => {
  assert.equal(matchesSearch("", "なんでも"), true);
  assert.equal(matchesSearch("   ", "なんでも"), true);
});
test("part of a word is enough, case does not matter", () => {
  assert.equal(matchesSearch("tan", "担当：Tanvir"), true);
  assert.equal(matchesSearch("SQL基", "sql基礎研修"), true);
  assert.equal(matchesSearch("xyz", "担当：Tanvir"), false);
});
test("several words in any order, all must match", () => {
  assert.equal(matchesSearch("研修 sql", "SQL基礎研修"), true);
  assert.equal(matchesSearch("確認　担当", "担当者の確認"), true);
  assert.equal(matchesSearch("確認 営業", "担当者の確認"), false);
});
test("full-width, half-width and kana forms are the same", () => {
  assert.equal(matchesSearch("ＳＱＬ", "sql研修"), true);
  assert.equal(matchesSearch("ｓｑｌ１", "SQL1日目"), true);
  assert.equal(matchesSearch("ブランディング", "ぶらんでぃんぐ講座"), true);
  assert.equal(matchesSearch("ぶらんでぃんぐ", "ブランディング講座"), true);
});
test("separators are ignored", () => {
  assert.equal(matchesSearch("codex-確認", "Codex確認担当"), true);
  assert.equal(matchesSearch("codex 確認担当", "Codex確認担当20261022"), true);
  assert.equal(matchesSearch("ab-cd", "abcd"), true);
  assert.equal(matchesSearch("abcd", "ab cd"), true);
});

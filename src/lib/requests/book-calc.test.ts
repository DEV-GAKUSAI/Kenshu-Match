import test from "node:test";
import assert from "node:assert/strict";

import { addableCandidates, bookFieldsError, filterBook, MAX_SPEAKING, MAX_STRENGTHS, parsePastRate, pastRateText, type BookLike } from "./book-calc.ts";

const base: BookLike = {
  entry_id: "e1",
  instructor_id: null,
  external_name: "山田太郎",
  external_contact: null,
  list_kind: "candidate",
  note: null,
  strength_field_ids: [],
  past_rate_amount: null,
  past_rate_unit: null,
  speaking_record: null,
  is_favorite: false,
};
const fields = { f1: "Java", f2: "データベース基礎" };
const nameOf = (e: BookLike) => e.external_name ?? "（登録講師）";
const all = { query: "", kind: "all" as const, favoriteOnly: false, fieldId: "" };

test("form: empty rate is fine, a good rate is fine", () => {
  assert.equal(bookFieldsError({ strengthIds: [], rateText: "", rateUnit: "hour", speaking: "" }), null);
  assert.equal(bookFieldsError({ strengthIds: ["f1"], rateText: "15,000", rateUnit: "day", speaking: "Oracle登壇3回" }), null);
  assert.equal(bookFieldsError({ strengthIds: [], rateText: "１５０００", rateUnit: "hour", speaking: "" }), null);
});

test("form: bad rate, too large, too many strengths, long record", () => {
  assert.match(bookFieldsError({ strengthIds: [], rateText: "abc", rateUnit: "hour", speaking: "" }) ?? "", /数字/);
  assert.match(bookFieldsError({ strengthIds: [], rateText: "0", rateUnit: "hour", speaking: "" }) ?? "", /1円以上/);
  assert.match(bookFieldsError({ strengthIds: [], rateText: "10000001", rateUnit: "hour", speaking: "" }) ?? "", /10,000,000円以下/);
  assert.match(bookFieldsError({ strengthIds: Array(MAX_STRENGTHS + 1).fill("x"), rateText: "", rateUnit: "hour", speaking: "" }) ?? "", /得意領域/);
  assert.match(bookFieldsError({ strengthIds: [], rateText: "", rateUnit: "hour", speaking: "あ".repeat(MAX_SPEAKING + 1) }) ?? "", /登壇実績/);
});

test("parsePastRate keeps amount and unit together", () => {
  assert.deepEqual(parsePastRate("", "day"), { amount: null, unit: null });
  assert.deepEqual(parsePastRate("15,000", "day"), { amount: 15000, unit: "day" });
  assert.deepEqual(parsePastRate("１２０００", "hour"), { amount: 12000, unit: "hour" });
});

test("pastRateText", () => {
  assert.equal(pastRateText({ past_rate_amount: null, past_rate_unit: null }), "");
  assert.equal(pastRateText({ past_rate_amount: 15000, past_rate_unit: "hour" }), "¥15,000／時間");
  assert.equal(pastRateText({ past_rate_amount: 300000, past_rate_unit: "total" }), "¥300,000（総額）");
});

test("search looks at name, memo, strengths, record and rate", () => {
  const a: BookLike = { ...base, entry_id: "a", external_name: "山田太郎", strength_field_ids: ["f1"], speaking_record: "Oracleセミナー登壇" };
  const b: BookLike = { ...base, entry_id: "b", external_name: "佐藤花子", note: "丁寧", past_rate_amount: 20000, past_rate_unit: "hour" };
  const list = [a, b];
  assert.deepEqual(filterBook(list, { ...all, query: "java" }, nameOf, fields).map((e) => e.entry_id), ["a"]);
  assert.deepEqual(filterBook(list, { ...all, query: "oracle" }, nameOf, fields).map((e) => e.entry_id), ["a"]);
  assert.deepEqual(filterBook(list, { ...all, query: "さとう" }, nameOf, fields).map((e) => e.entry_id), []); // kanji names do not match kana
  assert.deepEqual(filterBook(list, { ...all, query: "佐藤 丁寧" }, nameOf, fields).map((e) => e.entry_id), ["b"]);
  assert.deepEqual(filterBook(list, { ...all, query: "20,000" }, nameOf, fields).map((e) => e.entry_id), ["b"]);
  assert.equal(filterBook(list, all, nameOf, fields).length, 2);
});

test("filters: kind, favourite, strength field; favourites come first", () => {
  const a: BookLike = { ...base, entry_id: "a", list_kind: "regular", strength_field_ids: ["f2"] };
  const b: BookLike = { ...base, entry_id: "b", list_kind: "candidate", is_favorite: true, strength_field_ids: ["f1", "f2"] };
  const c: BookLike = { ...base, entry_id: "c", list_kind: "candidate" };
  const list = [a, b, c];
  assert.deepEqual(filterBook(list, all, nameOf, fields).map((e) => e.entry_id), ["b", "a", "c"]);
  assert.deepEqual(filterBook(list, { ...all, kind: "regular" }, nameOf, fields).map((e) => e.entry_id), ["a"]);
  assert.deepEqual(filterBook(list, { ...all, favoriteOnly: true }, nameOf, fields).map((e) => e.entry_id), ["b"]);
  assert.deepEqual(filterBook(list, { ...all, fieldId: "f2" }, nameOf, fields).map((e) => e.entry_id), ["b", "a"]);
  assert.deepEqual(filterBook(list, { ...all, fieldId: "f1" }, nameOf, fields).map((e) => e.entry_id), ["b"]);
});

test("addable candidates skip the ones already on the request, favourites first", () => {
  const a: BookLike = { ...base, entry_id: "a" };
  const b: BookLike = { ...base, entry_id: "b", is_favorite: true };
  const c: BookLike = { ...base, entry_id: "c" };
  assert.deepEqual(addableCandidates([a, b, c], ["c"]).map((e) => e.entry_id), ["b", "a"]);
  assert.deepEqual(addableCandidates([a], ["a"]), []);
});

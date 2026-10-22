import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_AVAILABILITY_FILTER as E, matchesAvailability, periodLabel, rolesLabel } from "./availability.ts";

const f = (o: object) => ({ ...E, ...o });

test("no filter matches everyone", () => {
  assert.equal(matchesAvailability({}, E), true);
});

test("period must cover the whole range; empty period = any time", () => {
  const range = f({ from: "2026-11-01", until: "2026-11-30" });
  assert.equal(matchesAvailability({}, range), true);
  assert.equal(matchesAvailability({ available_from: "2026-10-26", available_until: "2026-12-20" }, range), true);
  assert.equal(matchesAvailability({ available_from: "2026-11-05", available_until: "2026-12-20" }, range), false);
  assert.equal(matchesAvailability({ available_from: "2026-10-26", available_until: "2026-11-20" }, range), false);
  assert.equal(matchesAvailability({ available_from: "2026-10-26" }, range), true);
  assert.equal(matchesAvailability({ available_until: "2026-11-20" }, range), false);
});

test("one date only is a single day", () => {
  const day = f({ from: "2026-11-10" });
  assert.equal(matchesAvailability({ available_from: "2026-11-10", available_until: "2026-11-10" }, day), true);
  assert.equal(matchesAvailability({ available_until: "2026-11-09" }, day), false);
});

test("language and role filters hide instructors with nothing set", () => {
  assert.equal(matchesAvailability({}, f({ languages: ["英語"] })), false);
  assert.equal(matchesAvailability({ training_languages: ["日本語", "英語"] }, f({ languages: ["英語"] })), true);
  assert.equal(matchesAvailability({ training_languages: ["日本語"] }, f({ languages: ["英語", "中国語"] })), false);
  assert.equal(matchesAvailability({}, f({ roles: ["MAIN"] })), false);
  assert.equal(matchesAvailability({ roles: ["SUB"] }, f({ roles: ["MAIN", "SUB"] })), true);
});

test("labels", () => {
  assert.equal(periodLabel({ available_from: "2026-10-26", available_until: "2026-12-20" }), "10/26〜12/20");
  assert.equal(periodLabel({}), "いつでも");
  assert.equal(rolesLabel(["MAIN", "SUB"]), "メイン講師、サブ講師");
});

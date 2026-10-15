import assert from "node:assert/strict";
import test from "node:test";

import { applyMineDisplay, toDisplay } from "./display.ts";

const row = {
  id: "a",
  name: "Alamgir Hossain",
  avatar_url: "https://x/p.png",
  portfolio_url: "https://x",
  years_of_experience: 9,
  certifications: ["X"],
  self_pr: "old text",
  work_style: "ONLINE",
  prefectures: ["東京都"],
  desired_rate_min: 1000,
  desired_rate_max: 2000,
  rating_avg: 4.5,
};

test("rows with Mine data show initials and only the allowed Mine items", () => {
  const map = { a: toDisplay("A.H.", { self_introduction: "hello", training_conditions: { hourly_rate_min: 5000, work_style: "HYBRID", prefectures: ["京都府"] } }) };
  const [out] = applyMineDisplay([row], map);
  assert.equal(out.name, "A.H.");
  assert.equal(out.self_pr, "hello");
  assert.equal(out.work_style, "HYBRID");
  assert.deepEqual(out.prefectures, ["京都府"]);
  assert.equal(out.desired_rate_min, 5000);
  assert.equal(out.desired_rate_max, 5000);
  assert.equal(out.rating_avg, 4.5);
});

test("old personal fields never survive, even with no Mine data", () => {
  const [out] = applyMineDisplay([row], {});
  assert.equal(out.name, "A.H.");
  assert.equal(out.avatar_url, null);
  assert.equal(out.portfolio_url, null);
  assert.equal(out.years_of_experience, null);
  assert.equal(out.certifications, null);
  assert.equal(out.self_pr, null);
  assert.equal(out.work_style, null);
  assert.equal(out.prefectures, null);
  assert.equal(out.desired_rate_min, null);
  assert.equal(out.desired_rate_max, null);
  assert.ok(!JSON.stringify(out).includes("Alamgir"));
});

test("an unknown work style from Mine is ignored", () => {
  const map = { a: toDisplay("A.H.", { training_conditions: { work_style: "MOON" } }) };
  assert.equal(applyMineDisplay([row], map)[0].work_style, null);
});

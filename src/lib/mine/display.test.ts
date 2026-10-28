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
};

test("rows with Mine data show initials and only the allowed Mine items", () => {
  const map = {
    a: toDisplay(
      "A.H.",
      {
        self_introduction: "hello",
        training_conditions: { hourly_rate_min: 5000, work_style: "HYBRID", prefectures: ["京都府"] },
        qualifications: [{ name: "資格1" }, { name: "資格2" }, { name: "資格3" }, { name: "資格4" }, { name: "資格5" }],
      },
      "https://signed/photo",
    ),
  };
  const [out] = applyMineDisplay([row], map);
  assert.deepEqual(out.certifications, ["資格1", "資格2", "資格3", "資格4", "資格5"]); // no limit
  assert.equal(out.avatar_url, "https://signed/photo");
  assert.equal(out.name, "A.H.");
  assert.equal(out.self_pr, "hello");
  assert.equal(out.work_style, "HYBRID");
  assert.deepEqual(out.prefectures, ["京都府"]);
  assert.equal(out.desired_rate_min, 5000);
  assert.equal(out.desired_rate_max, 5000);
});

test("occupations from Mine show on the row; none means null", () => {
  const map = { a: toDisplay("A.H.", { occupations: [{ name: "ITエンジニア" }, { name: "講師" }] }) };
  const names = (r: unknown) => (r as { occupation_names: string[] | null }).occupation_names;
  assert.deepEqual(names(applyMineDisplay([row], map)[0]), ["ITエンジニア", "講師"]);
  assert.equal(names(applyMineDisplay([row], {})[0]), null);
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

test("稼働条件 from Mine reach the row; missing ones are null", () => {
  const map = {
    a: toDisplay("A.H.", {
      training_conditions: { available_from: "2026-10-26", available_until: "2026-12-20", training_languages: ["英語"], roles: ["MAIN", "SUB"] },
    }),
  };
  const out = applyMineDisplay([row], map)[0] as unknown as Record<string, unknown>;
  assert.equal(out.available_from, "2026-10-26");
  assert.equal(out.available_until, "2026-12-20");
  assert.deepEqual(out.training_languages, ["英語"]);
  assert.deepEqual(out.roles, ["MAIN", "SUB"]);
  const none = applyMineDisplay([row], {})[0] as unknown as Record<string, unknown>;
  assert.equal(none.available_from, null);
  assert.equal(none.training_languages, null);
});

test("スキル and 実績 from Mine are kept for keyword search; none means null", () => {
  const map = {
    a: toDisplay("A.H.", {
      skills: [{ name: "Java" }, { name: "SQL" }],
      work_history: [{ company_name: "株式会社テスト", position: "講師" }],
    }),
  };
  const out = applyMineDisplay([row], map)[0] as unknown as Record<string, unknown>;
  assert.deepEqual(out.skill_names, ["Java", "SQL"]);
  assert.deepEqual(out.experience_names, ["講師", "株式会社テスト"]);
  const none = applyMineDisplay([row], {})[0] as unknown as Record<string, unknown>;
  assert.equal(none.skill_names, null);
  assert.equal(none.experience_names, null);
});

test("教えられる分野・ツール from Mine reach the row; none means null", () => {
  const list = [{ k: "tool" as const, n: "Oracle", y: 5, t: true }, { k: "field" as const, n: "ネットワーク" }];
  const out = applyMineDisplay([row], { a: toDisplay("A.H.", { training_conditions: { training_skills: list } }) })[0] as unknown as Record<string, unknown>;
  assert.deepEqual(out.training_skills, list);
  const none = applyMineDisplay([row], { a: toDisplay("A.H.", { training_conditions: {} }) })[0] as unknown as Record<string, unknown>;
  assert.equal(none.training_skills, null);
});

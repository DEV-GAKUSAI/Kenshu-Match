import assert from "node:assert/strict";
import { test } from "node:test";

import { FakeStore } from "./fake-store.ts";
import { internalEmailFor, runMineHandoff, type MineHandoffInput } from "./handoff-service.ts";

const MINE = "11111111-1111-4111-8111-111111111111";
let nonceCounter = 0;
function ticket(fields?: string[], overrides: Partial<MineHandoffInput> = {}): MineHandoffInput {
  nonceCounter += 1;
  return {
    sub: MINE,
    email: "Person@Example.com",
    name: "  山田 太郎 ",
    nonce: `nonce-${nonceCounter}`,
    exp: Math.floor(Date.now() / 1000) + 100,
    fields,
    ...overrides,
  };
}

void test("new Mine user with matching skills: account created, INSTRUCTOR, mapped expertise synced", async () => {
  const store = new FakeStore();
  const result = await runMineHandoff(store, ticket(["Python", "React", "Rust"]));
  assert.ok(result.ok);
  const id = result.kenshuUserId;
  assert.equal(store.users.get(id)?.role, "INSTRUCTOR");
  assert.equal(store.users.get(id)?.name, "山田 太郎");
  assert.equal(store.profiles.get(id), "person@example.com");
  assert.equal(store.links.get(MINE), id);
  assert.deepEqual([...(store.expertise.get(id) ?? [])].sort(), ["sub-python", "sub-react"]);
  assert.deepEqual(result.sync, { added: 2, removed: 0 });
});

void test("user with no mapped skills gets an account but no invented expertise", async () => {
  const store = new FakeStore();
  const noneMapped = await runMineHandoff(store, ticket(["Rust"]));
  assert.ok(noneMapped.ok);
  assert.equal((store.expertise.get(noneMapped.kenshuUserId)?.size ?? 0), 0);
  const empty = await runMineHandoff(new FakeStore(), ticket([]));
  assert.ok(empty.ok);
  assert.deepEqual(empty.sync, { added: 0, removed: 0 });
});

void test("existing linked user is reused; a second visit creates nothing new", async () => {
  const store = new FakeStore();
  const first = await runMineHandoff(store, ticket(["Python"]));
  const second = await runMineHandoff(store, ticket(["Python"]));
  assert.ok(first.ok && second.ok);
  assert.equal(first.kenshuUserId, second.kenshuUserId);
  assert.equal(store.users.size, 1);
  assert.deepEqual(second.sync, { added: 0, removed: 0 });
});

void test("reopening after Mine skills change adds and removes only Mine-synced expertise, keeps manual", async () => {
  const store = new FakeStore();
  const first = await runMineHandoff(store, ticket(["Python", "React"]));
  assert.ok(first.ok);
  const id = first.kenshuUserId;
  store.expertise.get(id)?.add("sub-manual"); // added by hand in Kenshu Link
  const second = await runMineHandoff(store, ticket(["Python", "Excel"]));
  assert.ok(second.ok);
  assert.deepEqual([...(store.expertise.get(id) ?? [])].sort(), ["sub-excel", "sub-manual", "sub-python"]);
  assert.deepEqual(second.sync, { added: 1, removed: 1 });
  // Mine skills all removed: only synced rows go, manual stays.
  const third = await runMineHandoff(store, ticket([]));
  assert.ok(third.ok);
  assert.deepEqual([...(store.expertise.get(id) ?? [])], ["sub-manual"]);
});

void test("a field the person added by hand is not removed even if Mine used to map it", async () => {
  const store = new FakeStore();
  const first = await runMineHandoff(store, ticket([]));
  assert.ok(first.ok);
  store.expertise.set(first.kenshuUserId, new Set(["sub-python"])); // manual
  const second = await runMineHandoff(store, ticket(["Python"]));
  assert.ok(second.ok);
  await runMineHandoff(store, ticket([]));
  assert.deepEqual([...(store.expertise.get(first.kenshuUserId) ?? [])], ["sub-python"]);
});

void test("first attempt failing after the login was created does not block a retry", async () => {
  const store = new FakeStore();
  store.linkFailuresLeft = 1;
  await assert.rejects(runMineHandoff(store, ticket(["Python"])));
  assert.equal(store.links.size, 0);
  const retry = await runMineHandoff(store, ticket(["Python"]));
  assert.ok(retry.ok);
  assert.equal(store.users.size, 1);
  assert.equal(store.links.get(MINE), retry.kenshuUserId);
});

void test("a login that never got its users row is repaired on retry", async () => {
  const store = new FakeStore();
  store.failCreateAfterAuth = true; // login exists, users row missing
  const first = await runMineHandoff(store, ticket([]));
  assert.ok(first.ok); // ensureInstructorUserRow repairs it straight away
  const orphan = new FakeStore();
  orphan.authUsers.set(internalEmailFor(MINE), "00000000-0000-4000-8000-0000000000aa");
  const repaired = await runMineHandoff(orphan, ticket([]));
  assert.ok(repaired.ok);
  assert.equal(orphan.users.get(repaired.kenshuUserId)?.role, "INSTRUCTOR");
});

void test("a ticket cannot be used twice", async () => {
  const store = new FakeStore();
  const t = ticket([]);
  assert.ok((await runMineHandoff(store, t)).ok);
  const again = await runMineHandoff(store, t);
  assert.deepEqual(again, { ok: false, reason: "replay" });
});

void test("a skill-sync failure never blocks sign-in", async () => {
  const store = new FakeStore();
  store.failListSubcategories = true;
  const result = await runMineHandoff(store, ticket(["Python"]));
  assert.ok(result.ok);
  assert.equal(result.sync, "failed");
});

void test("an older Mine ticket without fields skips the sync", async () => {
  const store = new FakeStore();
  const first = await runMineHandoff(store, ticket(["Python"]));
  assert.ok(first.ok);
  const old = await runMineHandoff(store, ticket(undefined));
  assert.ok(old.ok);
  assert.equal(old.sync, "skipped");
  assert.deepEqual([...(store.expertise.get(first.kenshuUserId) ?? [])], ["sub-python"]);
});

void test("a non-instructor account with the internal address is refused", async () => {
  const store = new FakeStore();
  store.users.set("x", { id: "x", role: "COMPANY", email: internalEmailFor(MINE), name: "n" });
  assert.deepEqual(await runMineHandoff(store, ticket([])), { ok: false, reason: "wrong_role" });
});

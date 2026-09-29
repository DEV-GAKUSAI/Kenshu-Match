import assert from "node:assert/strict";
import { test } from "node:test";

import { FakeStore } from "./fake-store.ts";
import { runMineHandoff } from "./handoff-service.ts";
import { countMatchingOpenRequests, isAuthorizedMatchCountRequest, isMineUserId } from "./match-count.ts";

const MINE = "22222222-2222-4222-8222-222222222222";
const SECRET = "s".repeat(40);

async function linked(store: FakeStore, fields: string[]) {
  const result = await runMineHandoff(store, {
    sub: MINE, email: "a@example.com", name: "A", nonce: `n-${Math.random()}`, exp: Math.floor(Date.now() / 1000) + 60, fields,
  });
  assert.ok(result.ok);
  return result.kenshuUserId;
}

void test("counts open broadcast requests that match the expertise", async () => {
  const store = new FakeStore();
  await linked(store, ["Python", "React"]);
  store.requests = [
    { id: "r1", field: "sub-python", status: "pending", target: null },
    { id: "r2", field: "sub-react", status: "pending", target: null },
    { id: "r3", field: "sub-excel", status: "pending", target: null },
  ];
  assert.equal(await countMatchingOpenRequests(store, MINE), 2);
});

void test("zero when nothing matches, nothing mapped, or not linked", async () => {
  const store = new FakeStore();
  assert.equal(await countMatchingOpenRequests(store, MINE), 0); // not linked
  await linked(store, ["Rust"]);
  store.requests = [{ id: "r1", field: "sub-python", status: "pending", target: null }];
  assert.equal(await countMatchingOpenRequests(store, MINE), 0);
});

void test("does not count cancelled, accepted, completed, directed or already-answered requests", async () => {
  const store = new FakeStore();
  const instructor = await linked(store, ["Python"]);
  store.requests = [
    { id: "ok", field: "sub-python", status: "pending", target: null },
    { id: "cancelled", field: "sub-python", status: "cancelled", target: null },
    { id: "accepted", field: "sub-python", status: "accepted", target: null },
    { id: "completed", field: "sub-python", status: "completed", target: null },
    { id: "directed", field: "sub-python", status: "pending", target: "someone" },
    { id: "answered", field: "sub-python", status: "pending", target: null },
  ];
  store.responses = [{ requestId: "answered", instructorId: instructor }];
  assert.equal(await countMatchingOpenRequests(store, MINE), 1);
});

void test("manually added expertise also counts", async () => {
  const store = new FakeStore();
  const instructor = await linked(store, []);
  store.expertise.set(instructor, new Set(["sub-manual"]));
  store.requests = [{ id: "r", field: "sub-manual", status: "pending", target: null }];
  assert.equal(await countMatchingOpenRequests(store, MINE), 1);
});

void test("the shared secret is required and checked exactly", () => {
  assert.equal(isAuthorizedMatchCountRequest(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(isAuthorizedMatchCountRequest(`bearer ${SECRET}`, SECRET), true);
  assert.equal(isAuthorizedMatchCountRequest(`Bearer ${SECRET}x`, SECRET), false);
  assert.equal(isAuthorizedMatchCountRequest(null, SECRET), false);
  assert.equal(isAuthorizedMatchCountRequest("Bearer ", SECRET), false);
  assert.equal(isAuthorizedMatchCountRequest(`Bearer ${SECRET}`, undefined), false);
  assert.equal(isAuthorizedMatchCountRequest("Bearer short", "short"), false);
});

void test("only a UUID is accepted as the Mine user id", () => {
  assert.equal(isMineUserId(MINE), true);
  assert.equal(isMineUserId("abc"), false);
  assert.equal(isMineUserId(undefined), false);
});

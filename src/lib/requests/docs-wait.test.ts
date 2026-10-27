import test from "node:test";
import assert from "node:assert/strict";
import { docFlowIndex, docWaits, hasUnseenWait, markWaitsSeen } from "./docs-wait.ts";

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

test("lecturer waits on an issued order and a returned invoice", () => {
  const w = docWaits("instructor", { order: { status: "issued", revision: 2 }, invoice: { status: "returned", revision: 1 } });
  assert.deepEqual(w.map((x) => x.key), ["order:issued:2", "invoice:returned:1"]);
});

test("company waits on a declined order and a submitted invoice", () => {
  const w = docWaits("requester", { order: { status: "declined", revision: 1 }, invoice: { status: "submitted", revision: 3 } });
  assert.deepEqual(w.map((x) => x.key), ["order:declined:1", "invoice:submitted:3"]);
});

test("confirmed / paid documents wait for nobody", () => {
  const d = { order: { status: "confirmed", revision: 1 }, invoice: { status: "paid", revision: 1 } };
  assert.equal(docWaits("instructor", d).length, 0);
  assert.equal(docWaits("requester", d).length, 0);
  assert.equal(docWaits("requester", undefined).length, 0);
});

test("seen is remembered, and a new revision shows the dot again", () => {
  const s = memStore();
  const first = docWaits("instructor", { order: { status: "issued", revision: 1 } });
  assert.equal(hasUnseenWait("r1", first, s), true);
  markWaitsSeen("r1", first.map((x) => x.key), s);
  assert.equal(hasUnseenWait("r1", first, s), false);
  const second = docWaits("instructor", { order: { status: "issued", revision: 2 } });
  assert.equal(hasUnseenWait("r1", second, s), true);
});

test("no storage: the dot shows", () => {
  assert.equal(hasUnseenWait("r1", [{ key: "a", label: "a" }], null), true);
});

test("flow index follows the order and invoice", () => {
  assert.equal(docFlowIndex(null), 0);
  assert.equal(docFlowIndex({ order: { status: "issued", revision: 1 } }), 1);
  assert.equal(docFlowIndex({ order: { status: "declined", revision: 1 } }), 1);
  assert.equal(docFlowIndex({ order: { status: "confirmed", revision: 1 } }), 2);
  assert.equal(docFlowIndex({ order: { status: "confirmed", revision: 1 }, invoice: { status: "returned", revision: 1 } }), 2);
  assert.equal(docFlowIndex({ order: { status: "confirmed", revision: 1 }, invoice: { status: "submitted", revision: 1 } }), 3);
});

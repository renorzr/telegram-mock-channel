import test from "node:test";
import assert from "node:assert/strict";
import { MockStateStore } from "../src/state-store.js";

test("seq is monotonic per account", () => {
  const store = new MockStateStore();
  const a1 = store.recordOutbound("a", { type: "sendMessage", text: "one" });
  const a2 = store.recordOutbound("a", { type: "sendMessage", text: "two" });
  assert.equal(a1.seq, 1);
  assert.equal(a2.seq, 2);
});

test("seq is isolated by account", () => {
  const store = new MockStateStore();
  const a1 = store.recordOutbound("a", { type: "sendMessage" });
  const b1 = store.recordOutbound("b", { type: "sendMessage" });
  const a2 = store.recordOutbound("a", { type: "sendMessage" });
  assert.equal(a1.seq, 1);
  assert.equal(b1.seq, 1);
  assert.equal(a2.seq, 2);
});

test("listOutbound supports after_seq and limit", () => {
  const store = new MockStateStore();
  store.recordOutbound("acc", { type: "sendMessage", text: "1" });
  store.recordOutbound("acc", { type: "sendMessage", text: "2" });
  store.recordOutbound("acc", { type: "sendMessage", text: "3" });

  const result = store.listOutbound("acc", 1, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.seq, 2);
  assert.equal(result.nextAfterSeq, 2);
});

test("drainOutbound removes drained events", () => {
  const store = new MockStateStore();
  store.recordOutbound("acc", { type: "sendMessage", text: "1" });
  store.recordOutbound("acc", { type: "sendMessage", text: "2" });

  const drained = store.drainOutbound("acc", 1);
  assert.equal(drained.drainedCount, 1);
  assert.equal(drained.remaining, 1);

  const left = store.listOutbound("acc", 0, 10);
  assert.equal(left.events.length, 1);
  assert.equal(left.events[0]?.text, "2");
});

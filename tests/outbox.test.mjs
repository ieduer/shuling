// 戰報待送匣（2026-10-31）：送不出去的 /api/run 先存本機，之後補送；伺服器以同模式／範圍／種子／起始時刻去重，補送不會多算。
import { test } from "node:test";
import assert from "node:assert/strict";
import { enqueue, flushOutbox, OUTBOX_MAX, OUTBOX_TTL_MS, submitWithOutbox } from "../src/engine/outbox.ts";

const mem = () => {
  let v = [];
  return { get: () => v.slice(), set: (e) => (v = e.slice()) };
};
const run = (n, over = {}) => ({ mode: "lesson", scope: "L-x", seed: "s" + n, nick: "", answers: [{ q: "q1", pick: "甲", ms: 1200 }], startedAt: 1793400000000 + n, ...over });

test("送不到（null）就留在匣裡；業務拒絕（ok:false）不留；送到了不留", async () => {
  const store = mem();
  assert.equal(await submitWithOutbox(run(1), { submit: async () => null, store }), null);
  assert.equal(store.get().length, 1);
  const rejected = await submitWithOutbox(run(2), { submit: async () => ({ ok: false, reason: "bad_request" }), store });
  assert.equal(rejected.ok, false);
  assert.equal(store.get().length, 1);
  const okRes = await submitWithOutbox(run(3), { submit: async () => ({ ok: true, scored: true, score: 1, correct: 1, xp: 1, ranks: {} }), store });
  assert.equal(okRes.ok, true);
  assert.equal(store.get().length, 1);
});

test("補送：最舊的先、一遇到送不到就停、成功的才拿掉；同一份戰報不重複排隊", async () => {
  const store = mem();
  const now = 1793400000000;
  enqueue(run(1), { store, now: () => now });
  enqueue(run(2), { store, now: () => now + 1 });
  enqueue(run(1), { store, now: () => now + 2 }); // 同一份：只留一筆
  assert.equal(store.get().length, 2);
  const sent = [];
  let fail = false;
  const submit = async (p) => {
    if (fail) return null;
    sent.push(p.seed);
    if (p.seed === "s1") fail = true; // 送完第一份就斷線
    return { ok: true, duplicate: true };
  };
  assert.equal(await flushOutbox({ submit, store, now: () => now + 5 }), 1);
  assert.deepEqual(sent, ["s1"]);
  assert.deepEqual(store.get().map((e) => e.payload.seed), ["s2"]);
  fail = false;
  assert.equal(await flushOutbox({ submit, store, now: () => now + 6 }), 1);
  assert.equal(store.get().length, 0);
});

test("太舊的（14 天）不再補送；匣子最多留 60 份", async () => {
  const store = mem();
  const now = 1793400000000;
  enqueue(run(0), { store, now: () => now - OUTBOX_TTL_MS - 1 });
  for (let i = 1; i <= OUTBOX_MAX + 5; i++) enqueue(run(i), { store, now: () => now + i });
  assert.equal(store.get().length, OUTBOX_MAX);
  assert.equal(store.get()[0].payload.seed, "s6");
  const sent = [];
  await flushOutbox({ submit: async (p) => (sent.push(p.seed), { ok: true }), store, now: () => now + 100 });
  assert.equal(sent.length, OUTBOX_MAX);
  assert.equal(store.get().length, 0);
});

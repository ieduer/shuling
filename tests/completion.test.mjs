// 題海（2026-10-31）：文曲之後的路——每一道題答對一次算完成；以逐題紀錄 q[id].ok ≥ 1 計。
import { test } from "node:test";
import assert from "node:assert/strict";
import { completionOf } from "../src/engine/completion.ts";

test("答對過一次就算完成；錯過但沒對過不算；不在題庫的紀錄不算", () => {
  const q = { a: { ok: 1, bad: 3 }, b: { ok: 0, bad: 2 }, c: { ok: 5, bad: 0 }, zzz: { ok: 9, bad: 0 } };
  const c = completionOf(q, ["a", "b", "c", "d"]);
  assert.deepEqual(c, { done: 2, total: 4, left: 2, ratio: 0.5 });
});

test("空題庫與全完成", () => {
  assert.deepEqual(completionOf({}, []), { done: 0, total: 0, left: 0, ratio: 0 });
  assert.deepEqual(completionOf({ a: { ok: 1, bad: 0 } }, ["a"]), { done: 1, total: 1, left: 0, ratio: 1 });
});

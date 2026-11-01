// 關卡抽題至少三題（2026-10-31）：课内只有兩隻字靈的關（钱塘湖春行、十五从军征、幾張真題卷）原本單局只出 2 題，
// 本機 2/2 給三星、伺服器只把「≥3 題全對」算通關，排行榜段位因此少算通關數。
import { test } from "node:test";
import assert from "node:assert/strict";
import { fillToMinimum } from "../src/engine/pick.ts";
import { STAGE_MIN_QUESTIONS } from "../src/engine/rank.ts";

const id = (x) => x;

test("兩題湊到三題：補的題來自同課其餘題，順序由 order 決定，不重複", () => {
  const all = ["a", "b", "c", "d"];
  const out = fillToMinimum(["a", "c"], all, (rest) => rest.slice().reverse(), STAGE_MIN_QUESTIONS, 10);
  assert.deepEqual(out, ["a", "c", "d"]);
  assert.equal(new Set(out).size, out.length);
});

test("課文只有兩題就全出（不能無中生有）；已經 ≥3 題不動；size 上限仍守", () => {
  assert.deepEqual(fillToMinimum(["a"], ["a", "b"], id, 3, 10), ["a", "b"]);
  assert.deepEqual(fillToMinimum(["a", "b", "c"], ["a", "b", "c", "d"], id, 3, 10), ["a", "b", "c"]);
  assert.deepEqual(fillToMinimum(["a"], ["a", "b", "c", "d"], id, 3, 2), ["a", "b"]);
  assert.deepEqual(fillToMinimum([], [], id), []);
});

test("回新陣列，不改原本的 picked", () => {
  const picked = ["a"];
  const out = fillToMinimum(picked, ["a", "b", "c"], id);
  assert.deepEqual(picked, ["a"]);
  assert.equal(out.length, 3);
});

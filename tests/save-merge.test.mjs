// 存檔合併（v2.5 跨裝置同步）：合併只取大／取聯集——任何一方的詞力、局數、收服、星數、成就都不會因合併而減少；
// 同一份合併自己等於自己；壞欄位各自丟掉、未知欄位不帶。
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptySave, isEmptySave, mergeSaves, normalizeSave, saveSummary, serializeSave, utf8Bytes, SAVE_MAX_BYTES } from "../src/engine/save.ts";

const T = 1793300000000;
const mk = (over = {}) => normalizeSave({ ...emptySave(), ...over });

test("normalizeSave：壞欄位各自丟掉、數值截到範圍、本機專用欄位不帶", () => {
  const s = normalizeSave({ xp: "12.9", games: -3, best: 1e12, lastDay: "2026-13-99", daily: { "2026-10-29": { score: 300, at: T }, bad: "x" }, q: { a: { ok: 2, bad: "1", last: T, streak: 1 }, b: null }, cards: { c1: { seen: 3, ok: 3, bad: 0, first: T, masteredAt: T + 1 }, c2: { seen: 1, ok: 1, bad: 0, first: T, masteredAt: 0 } }, misses: ["a", 5, "b"], nick: "  太長的暱稱超過十二個字會被截斷  ", achievements: { first: T, junk: -1 }, stages: { "L-1": { stars: 9, best: 100, runs: 2 } }, dayRuns: { "2026-10-29|L-1": 2, "x": 0 }, owner: "u1", cloudAt: T, extra: 1 });
  assert.equal(s.xp, 12); assert.equal(s.games, 0); assert.equal(s.best, 1e9); assert.equal(s.lastDay, "");
  assert.deepEqual(Object.keys(s.daily), ["2026-10-29"]); assert.deepEqual(Object.keys(s.q), ["a"]); assert.equal(s.q.a.bad, 1);
  assert.equal(s.cards.c1.masteredAt, T + 1); assert.equal("masteredAt" in s.cards.c2, false);
  assert.deepEqual(s.misses, ["a", "b"]); assert.equal(s.nick.length, 12);
  assert.deepEqual(s.achievements, { first: T }); assert.equal(s.stages["L-1"].stars, 3); assert.deepEqual(s.dayRuns, { "2026-10-29|L-1": 2 });
  assert.equal("owner" in s, false); assert.equal("cloudAt" in s, false); assert.equal("extra" in s, false);
  assert.equal(normalizeSave(null), null); assert.equal(normalizeSave([1]), null); assert.equal(normalizeSave("x"), null);
});

test("mergeSaves：每個計數都 ≥ 兩邊；收服時間取最早；星數取大；成就取聯集；自己合自己不變", () => {
  const a = mk({ xp: 5000, games: 40, best: 400, bestCombo: 12, totalCorrect: 300, totalAnswered: 350, dayStreak: 3, lastDay: "2026-10-28", wins: 30, losses: 10,
    cards: { c1: { seen: 5, ok: 4, bad: 1, first: T, masteredAt: T + 5 }, c2: { seen: 2, ok: 2, bad: 0, first: T } }, q: { q1: { ok: 3, bad: 0, last: T, streak: 3 } },
    stages: { "L-1": { stars: 3, best: 200, runs: 2 }, "L-2": { stars: 1, best: 50, runs: 1 } }, daily: { "2026-10-28": { score: 300, at: T } }, achievements: { a1: T }, misses: ["q9", "q8"], dayRuns: { "2026-10-28|L-1": 1 }, nick: "甲", sound: true });
  const b = mk({ xp: 800, games: 7, best: 450, bestCombo: 5, totalCorrect: 50, totalAnswered: 60, dayStreak: 1, lastDay: "2026-10-29", wins: 5, losses: 2,
    cards: { c1: { seen: 6, ok: 3, bad: 3, first: T - 100, masteredAt: T + 1 }, c3: { seen: 3, ok: 3, bad: 0, first: T, masteredAt: T + 9 } }, q: { q1: { ok: 1, bad: 2, last: T + 10, streak: 0 }, q2: { ok: 1, bad: 0, last: T, streak: 1 } },
    stages: { "L-2": { stars: 3, best: 120, runs: 3 } }, daily: { "2026-10-28": { score: 250, at: T + 1 }, "2026-10-29": { score: 100, at: T + 2 } }, achievements: { a1: T - 5, a2: T }, misses: ["q7", "q8"], dayRuns: { "2026-10-29|L-2": 2 }, nick: "", sound: false });
  const m = mergeSaves(a, b);
  for (const k of ["xp", "games", "best", "bestCombo", "totalCorrect", "totalAnswered", "wins", "losses"]) { assert(m[k] >= a[k] && m[k] >= b[k], k); assert.equal(m[k], Math.max(a[k], b[k]), k); }
  assert.equal(m.lastDay, "2026-10-29"); assert.equal(m.dayStreak, 1, "以較晚那一天的連日數為準");
  assert.deepEqual(m.cards.c1, { seen: 6, ok: 4, bad: 3, first: T - 100, masteredAt: T + 1 }); assert.equal(m.cards.c2.seen, 2); assert.equal(m.cards.c3.masteredAt, T + 9);
  assert.deepEqual(m.q.q1, { ok: 3, bad: 2, last: T + 10, streak: 0 }); assert.equal(m.q.q2.ok, 1);
  assert.deepEqual(m.stages["L-1"], { stars: 3, best: 200, runs: 2 }); assert.deepEqual(m.stages["L-2"], { stars: 3, best: 120, runs: 3 });
  assert.equal(m.daily["2026-10-28"].score, 300); assert.equal(m.daily["2026-10-29"].score, 100);
  assert.deepEqual(m.achievements, { a1: T - 5, a2: T }); assert.deepEqual(m.dayRuns, { "2026-10-28|L-1": 1, "2026-10-29|L-2": 2 });
  assert.deepEqual(m.misses, ["q7", "q8", "q9"], "錯題以較新那份為先，再補另一份的");
  assert.equal(m.nick, "甲", "incoming 沒暱稱就留原本的"); assert.equal(m.sound, false, "偏好以 incoming 為準");
  const noPref = (s) => serializeSave({ ...s, nick: "", sound: false }); assert.equal(serializeSave(mergeSaves(a, a)), serializeSave(a)); assert.equal(noPref(mergeSaves(m, a)), noPref(m), "再合一次已含的那份不變（偏好欄位除外）"); assert.equal(noPref(mergeSaves(m, b)), noPref(mergeSaves(b, m)), "可交換（偏好欄位除外）");
  assert.equal(saveSummary(m).mastered, 2); assert.equal(saveSummary(m).stars, 6); assert.equal(saveSummary(m).games, 40);
});

test("mergeSaves：兩邊分頭前進再合併，字靈與關卡都是聯集", () => {
  const base = mk({ games: 10, cards: { x: { seen: 3, ok: 3, bad: 0, first: T, masteredAt: T } } });
  const dev1 = mergeSaves(base, mk({ games: 12, cards: { x: { seen: 4, ok: 4, bad: 0, first: T, masteredAt: T }, y: { seen: 3, ok: 3, bad: 0, first: T + 1, masteredAt: T + 1 } }, stages: { "L-1": { stars: 2, best: 90, runs: 1 } } }));
  const dev2 = mergeSaves(base, mk({ games: 11, cards: { x: { seen: 3, ok: 3, bad: 0, first: T, masteredAt: T }, z: { seen: 3, ok: 3, bad: 0, first: T + 2, masteredAt: T + 2 } }, stages: { "L-1": { stars: 3, best: 80, runs: 1 }, "L-2": { stars: 1, best: 30, runs: 1 } } }));
  const m = mergeSaves(dev1, dev2);
  assert.equal(saveSummary(m).mastered, 3); assert.equal(m.games, 12); assert.deepEqual(m.stages["L-1"], { stars: 3, best: 90, runs: 1 }); assert.equal(m.stages["L-2"].stars, 1);
  assert.equal(serializeSave(mergeSaves(dev2, dev1)).length, serializeSave(m).length);
});

test("空存檔判定、位元組計算與上限", () => {
  assert.equal(isEmptySave(emptySave()), true); assert.equal(isEmptySave(mk({ games: 1 })), false); assert.equal(isEmptySave(mk({ cards: { c: { seen: 1, ok: 0, bad: 1, first: T } } })), false);
  assert.equal(utf8Bytes("abc"), 3); assert.equal(utf8Bytes("字靈"), 6); assert.equal(utf8Bytes("𝄞"), 4);
  const big = mk({ q: Object.fromEntries(Array.from({ length: 2730 }, (_, i) => [`r1-${i.toString(16).padStart(16, "0")}`, { ok: 3, bad: 1, last: T, streak: 2 }])), cards: Object.fromEntries(Array.from({ length: 1286 }, (_, i) => [`c-${i.toString(16).padStart(10, "0")}`, { seen: 9, ok: 7, bad: 2, first: T, masteredAt: T }])) });
  const bytes = utf8Bytes(serializeSave(big)); assert(bytes < SAVE_MAX_BYTES / 2, `全題庫全字靈的存檔 ${bytes} B 要在上限的一半以內`);
});

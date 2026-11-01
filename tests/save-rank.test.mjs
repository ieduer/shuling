// 雲端存檔算段位（2026-10-31）：與裝置上 rankStatsOf 同規則；Worker 以此與戰報算的四項取大，榜上段位不低於玩家自己看到的。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { emptySave, normalizeSave } from "../src/engine/save.ts";
import { saveRankStats } from "../src/engine/save-rank.ts";
import { REGION_BOOKS, stageSets } from "../src/engine/rank.ts";
import { rankOf, RANKS } from "../src/engine/score.ts";

const lessons = JSON.parse(fs.readFileSync(new URL("../worker/lessons.json", import.meta.url), "utf8")).lessons;

test("收服看 masteredAt 或淨答對 ≥3；通關看三星；全通域看域內核心關卡", () => {
  const sets = stageSets(lessons);
  const stages = {};
  for (const id of sets.perRegion[REGION_BOOKS[0]]) stages[id] = { stars: 3, best: 100, runs: 1 };
  const cards = { a: { seen: 3, ok: 3, bad: 0, first: 1 }, b: { seen: 5, ok: 2, bad: 3, first: 1, masteredAt: 2 }, c: { seen: 4, ok: 3, bad: 2, first: 1 } };
  const s = normalizeSave({ ...emptySave(), xp: 7000, cards, stages });
  const st = saveRankStats(s, lessons);
  assert.equal(st.mastered, 2, "a by level, b by masteredAt; c is 3-1=2 → not mastered");
  assert.equal(st.cleared, sets.perRegion[REGION_BOOKS[0]].length);
  assert.equal(st.regions, 1);
  assert.equal(st.xp, 7000);
});

test("全部關卡三星＋450 收服＋30000 學力：段位依學力門檻", () => {
  const sets = stageSets(lessons);
  const stages = Object.fromEntries(sets.all.map((id) => [id, { stars: 3, best: 1, runs: 1 }]));
  const cards = Object.fromEntries(Array.from({ length: 450 }, (_, i) => ["c" + i, { seen: 3, ok: 3, bad: 0, first: 1, masteredAt: 2 }]));
  const st = saveRankStats(normalizeSave({ ...emptySave(), xp: 30000, cards, stages }), lessons);
  assert.equal(st.regions, REGION_BOOKS.length);
  assert.equal(st.cleared, sets.all.length);
  const prestige = 30000 + 450 * 30 + sets.all.length * 120 + REGION_BOOKS.length * 2500;
  assert.equal(rankOf(st).prestige, prestige);
  assert.equal(rankOf(st).idx, RANKS.findLastIndex((r) => !r.all && r.xp <= prestige));
  assert.equal(rankOf(saveRankStats(emptySave(), lessons)).idx, 0);
});

test("題海：存檔逐題紀錄裡答對過一次、且仍在題庫裡的題數；沒給題庫就是 0", () => {
  const s = normalizeSave({ ...emptySave(), q: { a: { ok: 1, bad: 2, last: 1, streak: 0 }, b: { ok: 0, bad: 3, last: 1, streak: 0 }, zz: { ok: 9, bad: 0, last: 1, streak: 9 } } });
  const st = saveRankStats(s, lessons, new Set(["a", "b", "c"]));
  assert.equal(st.done, 1); assert.equal(st.total, 3);
  assert.equal(saveRankStats(s, lessons).done, 0);
});

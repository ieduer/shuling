// 書靈段位（設計方案 §7）：學力＝對局入帳＋收服×30＋三星通關×120＋全通一域×2,500＋題海×4；段位只看學力門檻（字靈 v2.10 一把尺），
// 通人另須題庫每一題都答對過（P1 暫代「十一域全通＋論衡殿」）。統計規則前端與 Worker 共用。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RANKS, RANK_KEYS, BONUS, bonusOf, prestigeOf, rankIdxOf, rankOf, meetsRank, emptyStats } from "../src/engine/score.ts";
import { REGION_BOOKS, EXTRA_STAGE_BOOKS, stageSets, clearedStats, masteredFromTallies, repeatMultiplier, creditXp } from "../src/engine/rank.ts";

test("學術之路十二階：門檻逐階遞增，最高階通人另須全部題目", () => {
  assert.deepEqual(RANKS.map((r) => r.name), ["童蒙", "書生", "庠生", "太學生", "儒生", "博士", "校書", "著作", "蘭臺", "學士", "祭酒", "通人"]);
  assert.deepEqual(RANKS.map((r) => r.xp), [0, 1500, 5000, 12000, 24000, 40000, 60000, 85000, 115000, 150000, 200000, 300000]);
  for (let i = 1; i < RANKS.length; i++) assert(RANKS[i].xp > RANKS[i - 1].xp, RANKS[i].name);
  assert.equal(RANKS[11].all, true); assert.equal(RANKS.filter((r) => r.all).length, 1);
  assert.deepEqual(RANK_KEYS, ["xp", "done"]);
});

test("學力＝對局入帳＋成就加成：收服 30、三星通關 120、全通域 2,500、題海 4", () => {
  assert.deepEqual(BONUS, { mastered: 30, cleared: 120, regions: 2500, done: 4 });
  assert.equal(bonusOf({ xp: 0, mastered: 2, cleared: 3, regions: 1, done: 10 }), 60 + 360 + 2500 + 40);
  assert.equal(prestigeOf({ xp: 1000, mastered: 2, cleared: 3, regions: 1, done: 10 }), 1000 + 2960);
  assert.equal(prestigeOf(emptyStats(7)), 7);
});

test("段位與需求：下一階只差學力；通人還差題海；題庫總題數未知時拿不到通人", () => {
  assert.equal(rankOf(emptyStats(0)).name, "童蒙"); assert.equal(rankOf(emptyStats(1499)).name, "童蒙"); assert.equal(rankOf(emptyStats(1500)).name, "書生");
  const r = rankOf({ xp: 1000, mastered: 10, cleared: 2, regions: 0, done: 20, total: 739 }); // 1000+300+240+80 = 1620 → 書生
  assert.equal(r.name, "書生"); assert.equal(r.next.name, "庠生"); assert.deepEqual(r.needs, [{ key: "xp", have: 1620, need: 5000, left: 3380 }]);
  const top = { xp: 300000, mastered: 0, cleared: 0, regions: 0, done: 700, total: 739 };
  const z = rankOf(top); assert.equal(z.name, "祭酒"); assert.equal(z.next.name, "通人"); assert.deepEqual(z.needs, [{ key: "done", have: 700, need: 739, left: 39 }]);
  assert.equal(rankOf({ ...top, done: 739 }).name, "通人");
  assert.equal(rankOf({ ...top, done: 9999, total: 0 }).name, "祭酒", "總題數未知永遠拿不到通人");
  assert.equal(rankIdxOf(300000, 739, 739), 11); assert.equal(rankIdxOf(299999, 739, 739), 10); assert.equal(rankIdxOf(40000), 5);
  assert.equal(meetsRank({ xp: 1500, mastered: 0, cleared: 0, regions: 0 }, RANKS[1]), true);
});

test("重複出陣倍率 1 → 0.5 → 0.25 → 0.1，入帳四捨五入", () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(repeatMultiplier), [1, 0.5, 0.25, 0.1, 0.1]);
  assert.equal(creditXp(193, 0), 193); assert.equal(creditXp(193, 1), 97); assert.equal(creditXp(193, 2), 48); assert.equal(creditXp(193, 3), 19);
});

test("收服＝淨答對三次以上；通關＝三星；全通域＝域內每關三星；同課在兩域只算一關", () => {
  assert.equal(masteredFromTallies([{ ok: 3, bad: 0 }, { ok: 4, bad: 2 }, { ok: 3, bad: 2 }, { ok: 2, bad: 0 }, { ok: 5, bad: 5 }]), 3);
  const lessons = [{ id: "a", books: ["shi", "nobel"], questions: 5 }, { id: "b", books: ["shi"], questions: 3 }, { id: "c", books: ["nobel"], questions: 2 }, { id: "d", books: ["nobel"], questions: 9 }];
  const sets = stageSets(lessons);
  assert.deepEqual(sets.all, ["a", "b", "d"]); assert.deepEqual(sets.perRegion.shi, ["a", "b"]); assert.deepEqual(sets.perRegion.nobel, ["a", "d"]);
  const stars = { a: 3, b: 2, d: 3 };
  assert.deepEqual(clearedStats((id) => stars[id] || 0, lessons), { cleared: 2, regions: 1, stars: 8, total: 3 }, "星河（a、d）全通，詩國差 b");
});

test("旅程兩域順序與地圖登記一致；P1 沒有附加域", () => {
  const art = fs.readFileSync(new URL("../src/engine/art.ts", import.meta.url), "utf8");
  const regions = [...art.matchAll(/\{ id: "([a-z0-9]+)", books: \[([^\]]+)\], name: "[^"]+", sub: "[^"]+", map: [^,]+, guardian: "[^"]+", accent: "[^"]+"(, bonus: true)? \}/g)].map((m) => ({ id: m[1], books: m[2].replace(/"/g, "").split(",").map((s) => s.trim()), bonus: !!m[3] }));
  assert.deepEqual(regions.map((r) => r.books[0]), [...REGION_BOOKS]);
  assert.deepEqual([...EXTRA_STAGE_BOOKS], []);
});

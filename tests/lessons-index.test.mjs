// Worker 的關卡清單（worker/lessons.json）必須與題庫 meta 同步；關卡分母是段位加成（通關、全通域）的依據。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stageSets, REGION_BOOKS } from "../src/engine/rank.ts";

const read = (p) => JSON.parse(fs.readFileSync(new URL("../" + p, import.meta.url), "utf8"));
const v = read("src/data/bank-version.json").v;
const meta = read(`public/bank/meta.${v}.json`);
const idx = read("worker/lessons.json");

test("worker/lessons.json 是 meta.lessons 的投影（id／冊／題數），版本相同", () => {
  assert.equal(idx.v, v);
  assert.deepEqual(idx.lessons, meta.lessons.map((l) => ({ id: l.id, books: l.books, questions: l.questions, ...(l.bonus ? { bonus: true } : {}) })));
});

test("每一關至少三題、只屬一冊；全通域分母只有旅程兩域", () => {
  for (const l of idx.lessons) {
    assert(l.questions >= 3, l.id);
    assert.equal(l.books.length, 1, l.id);
  }
  const sets = stageSets(idx.lessons);
  assert.equal(sets.all.length, idx.lessons.length);
  assert.deepEqual(Object.keys(sets.perRegion), [...REGION_BOOKS]);
});

// 書靈題庫回歸檢查：分片／索引一致、每題來源齊全、授獎辭短語逐字出自官方原文、關卡名不洩題。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { questionScore } from "../src/engine/score.ts";
import { TYPE_NAMES } from "../src/engine/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const v = rd("src/data/bank-version.json").v;
const meta = rd(`public/bank/meta.${v}.json`);
const index = rd("worker/bank-index.json");
const chunks = fs.readdirSync(path.join(root, "public/bank")).filter((f) => f.endsWith(".json") && !f.startsWith("meta."));
const questions = chunks.flatMap((f) => rd(path.join("public/bank", f)).q);
const byId = new Map(questions.map((q) => [q.id, q]));
const sha16 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

test("分片、meta、伺服器索引三者一致，版本相同", () => {
  assert.equal(questions.length, meta.qi.length);
  assert.equal(Object.keys(index.q).length, meta.qi.length);
  assert.equal(index.version, v);
  for (const f of chunks) assert.ok(f.includes(v), `chunk ${f} carries bank version`);
  for (const [id, cardIdx, typeCode, book, , , lesson] of meta.qi) {
    const q = byId.get(id);
    assert.ok(q, id);
    assert.equal(meta.cards[cardIdx].id, q.c, id);
    assert.equal(TYPE_NAMES[typeCode], q.t, id);
    assert.equal(q.book, book, id);
    assert.ok(meta.lessons.some((l) => l.id === lesson), `${id} lesson`);
    assert.equal(index.q[id].a, sha16(q.opts[0]), `${id} answer hash`);
    assert.equal(index.q[id].c, q.c, id);
  }
});

test("每題四個互異選項、正解不在干擾項、有解析與已登記來源", () => {
  for (const q of questions) {
    assert.equal(q.opts.length, 4, q.id);
    assert.equal(new Set(q.opts).size, 4, q.id);
    assert.ok(q.why.length > 6, q.id);
    assert.ok(q.sources.length >= 1 && q.sources.every((s) => s.label && s.role), q.id);
  }
});

test("每張卡至少兩種事實可答（收服要跨事實），每關至少三題", () => {
  const typesOf = new Map();
  for (const q of questions) {
    if (!typesOf.has(q.c)) typesOf.set(q.c, new Set());
    typesOf.get(q.c).add(q.id); // 建置保證一題一事實，題數即事實數
  }
  for (const c of meta.cards) assert.ok((typesOf.get(c.id)?.size || 0) >= 2, `${c.id} ${c.w}`);
  for (const l of meta.lessons) assert.ok(l.questions >= 3, l.id);
});

test("授獎辭題的英文短語逐字出現在官方授獎辭裡", () => {
  const prizes = rd("data/raw/nobel/prizes-lit.json").nobelPrizes;
  const all = prizes.flatMap((p) => (p.laureates || []).map((l) => (l.motivation?.en || "").replace(/<\/?i>/gi, "").replace(/&ccedil;/g, "ç").replace(/&eacute;/g, "é").replace(/\s+/g, " ").toLowerCase()));
  const kws = questions.filter((q) => q.t === "kw" && q.book === "nobel");
  // 1931 年卡爾費爾特的授獎辭只有「卡爾費爾特的詩」，短語含得主姓名等於洩題，建置略過
  assert.equal(kws.length, 122, "每位得主一題（卡爾費爾特除外）");
  for (const q of kws) assert.ok(all.some((m) => m.includes(q.s.toLowerCase())), q.s);
});

test("關卡名不帶時代或年份（時代題、年份題才不會被關卡名洩題）", () => {
  for (const l of meta.lessons) {
    assert.ok(!/\d{4}/.test(l.title), l.title);
    assert.ok(!/^(先秦|漢|魏晉|南北朝|唐|五代|宋|元|明|清|近現代)/.test(l.title), l.title);
  }
});

test("真題限時 90 秒：讀完一首詩再作答仍有速度分，其他題型仍是 20 秒", () => {
  const exam30 = questionScore({ correct: true, tier: "N", type: "exam", ms: 30000, combo: 1 });
  const exam90 = questionScore({ correct: true, tier: "N", type: "exam", ms: 90000, combo: 1 });
  const who30 = questionScore({ correct: true, tier: "N", type: "who", ms: 30000, combo: 1 });
  assert.ok(exam30 > exam90, "exam answered in 30 s keeps a speed bonus");
  assert.equal(who30, questionScore({ correct: true, tier: "N", type: "who", ms: 20000, combo: 1 }), "other types still end at 20 s");
});

test("單題計分：答錯 0 分；稀有度與題型越高分越高", () => {
  assert.equal(questionScore({ correct: false, tier: "SSR", type: "kw", ms: 1000, combo: 5 }), 0);
  const n = questionScore({ correct: true, tier: "N", type: "who", ms: 19000, combo: 1 });
  const ssr = questionScore({ correct: true, tier: "SSR", type: "kw", ms: 19000, combo: 1 });
  assert.ok(ssr > n);
});

test("長名號字級：五字以上總寬不超過四字詞（球內單行不出框）", async () => {
  const { glyphPx } = await import("../src/engine/glyph.ts");
  const base = 140;
  const width = (w) => glyphPx(w, base) * Array.from(w).length;
  for (const c of meta.cards) assert.ok(width(c.w) <= width("一二三四") + 1, `${c.w} ${width(c.w)}`);
});

// 2026-11-26 用戶反饋兩項（task sixling-feedback-20261126）：
// 一、出陣（free）／復仇（wrong）不再按「同範圍今日第幾局」打折，改成同一題今天第二次答對起才遞減；同日站長追加闖關（lesson）也按題；只有今日試煉照舊按局數。
// 二、瀏覽器整頁翻譯（正體→简体）換掉文字節點後，React 移除／插入不再拋 NotFoundError；題面與選項按題目 key 重新掛載。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";
import { perQuestionMode, creditByQuestion, repeatMultiplier } from "../src/engine/rank.ts";
import { installTranslateGuard } from "../src/lib/dom-guard.ts";

const root = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), "utf8");
const sha16 = (t) => createHash("sha256").update(t).digest("hex").slice(0, 16);

test("按題遞減用在出陣、復仇與闖關（闖關 2026-11-26 站長追加）；只有今日試煉照舊按局數", () => {
  assert.equal(perQuestionMode("free"), true);
  assert.equal(perQuestionMode("wrong"), true);
  assert.equal(perQuestionMode("lesson"), true);
  for (const m of ["daily", "feihua", "jielong", ""]) assert.equal(perQuestionMode(m), false, m);
});

test("creditByQuestion：沒答對過的題全額，同一題第二次答對起 ×0.5、×0.25、×0.1；答錯不計次", () => {
  const none = () => 0;
  assert.deepEqual(creditByQuestion([{ q: "a", score: 100 }, { q: "b", score: 80 }], none), { credited: 180, repeated: 0 });
  const prior = { a: 1, b: 2, c: 5 };
  assert.deepEqual(creditByQuestion([{ q: "a", score: 100 }, { q: "b", score: 80 }, { q: "c", score: 50 }, { q: "d", score: 40 }], (q) => prior[q] || 0), { credited: 50 + 20 + 5 + 40, repeated: 3 });
  // 本局內同一題第二次出現也遞減；答錯的（0 分）不算一次
  assert.deepEqual(creditByQuestion([{ q: "x", score: 0 }, { q: "x", score: 60 }, { q: "x", score: 60 }], none), { credited: 60 + 30, repeated: 1 });
  assert.equal(repeatMultiplier(1), 0.5);
});

// ── Worker（esbuild 打包，跑在 node:sqlite 記憶體庫，套用真正的 migrations）──
async function loadWorker() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sixling-feedback-"));
  const out = path.join(dir, "worker.mjs");
  await build({ entryPoints: [new URL("worker/index.ts", root).pathname], bundle: true, format: "esm", platform: "neutral", target: "es2022", outfile: out, logLevel: "silent" });
  const mod = await import(out);
  fs.rmSync(dir, { recursive: true, force: true });
  return mod.default;
}
const seenSql = [];
function d1(db) {
  const prep = (sql, args = []) => ({
    sql, args, bind: (...b) => prep(sql, b),
    first: async (col) => { seenSql.push({ sql, args }); const row = db.prepare(sql).get(...args) ?? null; return col ? (row ? row[col] : null) : row; },
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
    all: async () => { seenSql.push({ sql, args }); return { results: db.prepare(sql).all(...args) }; },
  });
  return { prepare: (sql) => prep(sql), batch: async (stmts) => { db.exec("BEGIN"); try { const out = stmts.map((s) => (/^\s*select/i.test(s.sql) ? { results: db.prepare(s.sql).all(...s.args) } : (db.prepare(s.sql).run(...s.args), { success: true }))); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
function freshDb() {
  const db = new DatabaseSync(":memory:");
  for (const f of fs.readdirSync(new URL("migrations/", root)).filter((x) => x.endsWith(".sql")).sort()) db.exec(fs.readFileSync(new URL("migrations/" + f, root), "utf8"));
  return db;
}
globalThis.fetch = async (url) => { throw new Error("unexpected fetch " + url); };

const index = JSON.parse(read("worker/bank-index.json"));
const meta = JSON.parse(read(`public/bank/meta.${index.version}.json`));
function pickQuestions(n) {
  const byHash = new Map();
  for (const b of meta.books) { const chunk = JSON.parse(read(`public/bank/${b.id}.${index.version}.json`)); for (const q of chunk.q) for (const o of q.opts) byHash.set(sha16(o), o); }
  const out = [];
  for (const [id, e] of Object.entries(index.q)) { if (byHash.has(e.a)) out.push({ id, answer: byHash.get(e.a) }); if (out.length >= n) break; }
  assert.equal(out.length, n, "bank has enough indexed questions");
  return out;
}

const worker = await loadWorker();
const sqlite = freshDb();
const env = { DB: d1(sqlite), ASSETS: { fetch: async () => new Response("", { status: 404 }) } };
const [q1, q2, q3, q4, q5, q6] = pickQuestions(6);
let seq = 0;
async function run(pid, mode, scope, qs, { wrong = [] } = {}) {
  const startedAt = Date.now() - 60000 - 1000 * seq++;
  const answers = qs.map((q) => ({ q: q.id, pick: wrong.includes(q) ? "__wrong__" : q.answer, ms: 4000 }));
  const res = await worker.fetch(new Request("https://example.test/api/run", { method: "POST", headers: { "content-type": "application/json", cookie: "shuling_pid=" + pid }, body: JSON.stringify({ mode, scope, seed: "s" + seq, nick: "", startedAt, answers }) }), env);
  assert.equal(res.status, 200);
  return res.json();
}
const xpOf = (pid) => sqlite.prepare("SELECT xp FROM players WHERE pid = ?").get(pid).xp;

test("Worker：出陣同範圍再打一局，題目不同就全額；同一題今天再答對才遞減", async () => {
  const pid = "feedback-free-pid-0001";
  const a = await run(pid, "free", "all", [q1, q2]);
  assert.equal(a.ok, true); assert.equal(a.xpGain, a.score); assert.equal(a.multiplier, 1); assert.equal(a.repeatQs, 0);
  const b = await run(pid, "free", "all", [q3, q4]); // 舊規則下這是同範圍第二局 ×0.5
  assert.equal(b.xpGain, b.score, "different questions in the same scope are not discounted"); assert.equal(b.repeatQs, 0); assert.equal(b.repeat, 0);
  const c = await run(pid, "free", "all", [q1, q5]); // q1 今天第二次答對
  assert.equal(c.repeatQs, 1);
  assert(c.xpGain < c.score && c.xpGain > c.score / 2, `only q1 is halved (${c.xpGain} of ${c.score})`);
  assert.equal(xpOf(pid), a.xpGain + b.xpGain + c.xpGain);
});

test("Worker：復仇答對今天答錯過的題算全額；答對過的題再答才遞減", async () => {
  const pid = "feedback-wrong-pid-0002";
  const a = await run(pid, "free", "all", [q1, q2], { wrong: [q1] });
  assert.equal(a.correct, 1);
  const b = await run(pid, "wrong", "wrong", [q1]);
  assert.equal(b.xpGain, b.score, "first correct answer of q1 today is full"); assert.equal(b.repeatQs, 0);
  const c = await run(pid, "wrong", "wrong", [q2]);
  assert.equal(c.repeatQs, 1); assert.equal(c.xpGain, Math.round(c.score * 0.5));
});

test("Worker：闖關也按題遞減：同一關再打、同一題再答對才遞減，同一關換題全額；今日試煉仍按局數", async () => {
  const pid = "feedback-lesson-pid-0003";
  const a = await run(pid, "lesson", "L-x", [q6]);
  const b = await run(pid, "lesson", "L-x", [q6]);
  assert.equal(a.multiplier, 1); assert.equal(b.repeat, 0); assert.equal(b.repeatQs, 1); assert.equal(b.xpGain, Math.round(b.score * 0.5));
  const c = await run(pid, "lesson", "L-x", [q3]);
  assert.equal(c.repeatQs, 0); assert.equal(c.xpGain, c.score, "same lesson, different question: full");
  const d1 = await run(pid, "daily", "daily", [q4]); const d2 = await run(pid, "daily", "daily", [q5]);
  assert.equal(d1.multiplier, 1); assert.equal(d2.repeat, 1); assert.equal(d2.multiplier, 0.5, "daily keeps the per-scope run decay");
});

test("按題查詢走 arena_runs(pid, created_at) 索引與 arena_answers 主鍵，不掃全表", () => {
  const hit = seenSql.find((x) => /JOIN arena_answers/.test(x.sql));
  assert(hit, "per-question query ran");
  const plan = sqlite.prepare("EXPLAIN QUERY PLAN " + hit.sql).all(...hit.args).map((r) => r.detail).join(" | ");
  assert.match(plan, /SEARCH r USING INDEX idx_arena_runs_pid \(pid=\? AND created_at/, plan);
  assert.match(plan, /SEARCH a USING (PRIMARY KEY|INDEX sqlite_autoindex_arena_answers_1) \(run_id=\? AND q=\?\)/, plan);
  assert.doesNotMatch(plan, /SCAN (r|a)\b(?! USING)/, plan);
});

// ── 本機進度：finishRun 與 Worker 同一規則 ──
test("本機 finishRun：出陣、闖關不同題全額、同題遞減；今日試煉照舊按局數", async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  globalThis.window = globalThis.window || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sixling-feedback-progress-")); const out = path.join(dir, "progress.mjs");
  await build({ entryPoints: [new URL("src/engine/progress.ts", root).pathname], bundle: true, format: "esm", platform: "neutral", target: "es2022", define: { "process.env.NODE_ENV": '"test"' }, outfile: out, logLevel: "silent" });
  const { finishRun } = await import(out); fs.rmSync(dir, { recursive: true, force: true });
  const now = Date.now();
  const summary = (mode, scope, ids) => ({ mode, seed: "x" + Math.random(), scope, startedAt: now - 60000, finishedAt: now, answers: ids.map((q) => ({ q, pick: "p", ms: 4000, correct: true, score: 100, combo: 1 })), score: ids.length * 100, correct: ids.length, total: ids.length, maxCombo: 1, newCards: [], lost: false });
  const a = finishRun(summary("free", "all", ["q-a", "q-b"]));
  assert.equal(a.gain, 200); assert.equal(a.repeatQs, 0); assert.equal(a.multiplier, 1);
  const b = finishRun(summary("free", "all", ["q-c", "q-d"]));
  assert.equal(b.gain, 200, "same scope, different questions: full"); assert.equal(b.repeat, 0);
  const c = finishRun(summary("wrong", "wrong", ["q-a", "q-e"]));
  assert.equal(c.gain, 150); assert.equal(c.repeatQs, 1);
  const d = finishRun(summary("lesson", "L-1", ["q-f"]));
  const e = finishRun(summary("lesson", "L-1", ["q-f", "q-f-2"]));
  assert.equal(d.gain, 100); assert.equal(e.repeat, 0); assert.equal(e.repeatQs, 1); assert.equal(e.gain, 150, "lesson: the repeated question is halved, the new one is full");
  const g = finishRun(summary("daily", "daily", ["q-f-3"]));
  const h = finishRun(summary("daily", "daily", ["q-f-4"]));
  assert.equal(g.gain, 100); assert.equal(h.repeat, 1); assert.equal(h.gain, 50, "daily keeps the per-scope run decay");
});

// ── 翻譯防護 ──
test("installTranslateGuard：節點已被翻譯搬走時，移除略過、插入接在最後；其他情況照原生", () => {
  class FakeNode {
    constructor() { this.children = []; this.parentNode = null; }
    removeChild(c) { const i = this.children.indexOf(c); if (i < 0) { const e = new Error("NotFoundError"); e.name = "NotFoundError"; throw e; } this.children.splice(i, 1); c.parentNode = null; return c; }
    insertBefore(n, ref) { if (ref === null) { this.children.push(n); n.parentNode = this; return n; } const i = this.children.indexOf(ref); if (i < 0) throw new Error("NotFoundError"); this.children.splice(i, 0, n); n.parentNode = this; return n; }
  }
  const warn = console.warn; console.warn = () => {};
  try {
    assert.equal(installTranslateGuard(FakeNode), true);
    assert.equal(installTranslateGuard(FakeNode), false, "installs once");
    const p = new FakeNode(), a = new FakeNode(), b = new FakeNode(), moved = new FakeNode(), n = new FakeNode();
    p.insertBefore(a, null); p.insertBefore(b, a);
    assert.deepEqual(p.children, [b, a]);
    assert.equal(p.removeChild(moved), moved, "a node the translator already replaced is skipped, not thrown");
    p.insertBefore(n, moved);
    assert.deepEqual(p.children, [b, a, n], "insert before a moved reference appends");
    p.removeChild(b);
    assert.deepEqual(p.children, [a, n]);
  } finally { console.warn = warn; }
});

test("畫面：main 在渲染前裝防護；題面、選項、靈按題目 key 重新掛載；數字標 translate=no；飄字 key 不撞", () => {
  const main = read("src/main.tsx");
  assert(main.indexOf("installTranslateGuard();") > -1 && main.indexOf("installTranslateGuard();") < main.indexOf("createRoot("), "guard before createRoot");
  const battle = read("src/screens/Battle.tsx");
  assert.match(battle, /<div key=\{`spell-\$\{q\.id\}`\} className=\{`spell/);
  assert.match(battle, /<div key=\{`moves-\$\{q\.id\}`\} className=\{`moves/);
  assert.match(battle, /<Foe key=\{`foe-\$\{q\.id\}`\}/);
  assert.match(battle, /key=\{`dmg-\$\{dmg\.key\}`\}/);
  assert.match(battle, /key=\{`slash-\$\{slash\}`\}/);
  // 同一父節點下的兄弟 key 不可相同（spell 與 moves 同在 .battle 下）
  const keys = [...battle.matchAll(/key=\{`(spell|moves)-\$\{q\.id\}`\}/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["spell", "moves"]);
  assert.match(battle, /className="score-now-n" translate="no"/);
  assert.match(read("src/components/Foe.tsx"), /<span key=\{shown\} className="foe-glyph"/);
  assert.match(read("src/components/Timer.tsx"), /className="timer-num" translate="no"/);
  assert.match(read("src/screens/Result.tsx"), /題今天已答對過，這幾題學力遞減，其餘全額/);
});

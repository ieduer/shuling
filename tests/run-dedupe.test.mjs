// 同一份戰報送兩次（瀏覽器／網路在回應遺失後重送同一個 POST）只能入庫一次、只加一次詞力：10-28 線上兩位玩家各有 7／3 局重複，
// 詞力多算 1691／220。Worker 以 (pid, mode, scope, seed, startedAt) 判定重送；入庫列的 created_at - duration_ms 正是 startedAt。
// 這裡用 esbuild 打包 worker/index.ts，配一個只認本 Worker 幾句 SQL 的假 D1。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const sha16 = (t) => createHash("sha256").update(t).digest("hex").slice(0, 16);

async function loadWorker() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ziling-dedupe-"));
  const out = path.join(dir, "worker.mjs");
  await build({ entryPoints: [new URL("worker/index.ts", root).pathname], bundle: true, format: "esm", platform: "neutral", target: "es2022", outfile: out, logLevel: "silent" });
  const mod = await import(out);
  return { worker: mod.default, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** 假 D1：只實作本 Worker /api/run 用到的語句；資料表是記憶體陣列。 */
function fakeDb() {
  const runs = [], players = new Map(), answers = [], dailyBest = [], weekly = new Map();
  const exec = (sql, a) => {
    if (sql.startsWith("SELECT uc_slug, merged_into, games FROM players WHERE pid = ?")) { const [pid] = a; const p = players.get(pid); return p ? { uc_slug: p.uc_slug ?? null, merged_into: p.merged_into ?? null, games: p.games } : null; }
    if (sql.startsWith("INSERT INTO players")) { const [pid, created, seen] = a; const p = players.get(pid); if (p) p.last_seen = seen; else players.set(pid, { pid, nick: "", xp: 0, games: 0, best: 0, mastered: 0, cleared: 0, rank_idx: 0, created_at: created, last_seen: seen }); return null; }
    if (sql.startsWith("SELECT COUNT(*) AS n FROM arena_runs WHERE pid = ? AND scope = ? AND day_key = ?")) { const [pid, scope, day] = a; return { n: runs.filter((r) => r.pid === pid && r.scope === scope && r.day_key === day).length }; }
    if (sql.startsWith("SELECT SUM(a.correct) AS ok, COUNT(*) - SUM(a.correct) AS bad FROM arena_answers a JOIN arena_runs r")) { const [pid] = a; const ids = new Set(runs.filter((r) => r.pid === pid).map((r) => r.id)); const by = new Map(); for (const x of answers) if (ids.has(x.run_id)) { const t = by.get(x.card) || { ok: 0, bad: 0 }; if (x.correct) t.ok++; else t.bad++; by.set(x.card, t); } return [...by.values()]; }
    if (sql.startsWith("SELECT DISTINCT scope FROM arena_runs WHERE pid = ? AND mode = 'lesson' AND correct = total AND total >= 3")) { const [pid] = a; return [...new Set(runs.filter((r) => r.pid === pid && r.mode === "lesson" && r.correct === r.total && r.total >= 3).map((r) => r.scope))].map((scope) => ({ scope })); }
    if (sql.startsWith("UPDATE players SET mastered = ?, cleared = ?, rank_idx = ?, prestige = ? WHERE pid = ?")) { const [mastered, cleared, rank_idx, prestige, pid] = a; Object.assign(players.get(pid), { mastered, cleared, rank_idx, prestige }); return null; }
    if (sql.startsWith("SELECT xp, mastered, cleared, rank_idx FROM players")) { const [pid] = a; const p = players.get(pid); return p ? { xp: p.xp, mastered: p.mastered, cleared: p.cleared, rank_idx: p.rank_idx } : null; }
    if (sql.startsWith("SELECT id, score, correct, scored FROM arena_runs")) { const [pid, mode, scope, seed, started] = a; return runs.find((r) => r.pid === pid && r.mode === mode && r.scope === scope && r.seed === seed && r.created_at - r.duration_ms === started) ?? null; }
    if (sql.startsWith("SELECT score FROM daily_best")) { const [pid, day] = a; return dailyBest.find((d) => d.pid === pid && d.day_key === day) ?? null; }
    if (sql.startsWith("INSERT INTO arena_runs")) { const [id, pid, mode, scope, seed, day_key, week_key, score, correct, total, max_combo, duration_ms, scored, bank_v, created_at] = a; runs.push({ id, pid, mode, scope, seed, day_key, week_key, score, correct, total, max_combo, duration_ms, scored, bank_v, created_at }); return null; }
    if (sql.startsWith("UPDATE players SET xp = xp + ?")) { const [score, best, seen, nick1, nick2, pid] = a; const p = players.get(pid); p.xp += score; p.games += 1; p.best = Math.max(p.best, best); p.last_seen = seen; if (nick1 !== "") p.nick = nick2; return null; }
    if (sql.startsWith("INSERT OR IGNORE INTO arena_answers")) { const [run_id, q, card, correct, ms] = a; if (!answers.some((x) => x.run_id === run_id && x.q === q)) answers.push({ run_id, q, card, correct, ms }); return null; }
    if (sql.startsWith("INSERT INTO daily_best")) { const [pid, day_key, score, run_id, at] = a; dailyBest.push({ pid, day_key, score, run_id, at }); return null; }
    if (sql.startsWith("INSERT INTO weekly_sum")) { const [pid, week_key, score] = a; const k = pid + "|" + week_key; const w = weekly.get(k); if (w) { w.score += score; w.games += 1; } else weekly.set(k, { pid, week_key, score, games: 1 }); return null; }
    if (sql.startsWith("SELECT COUNT(*) + 1 AS r FROM daily_best")) { const [day, score] = a; return { r: dailyBest.filter((d) => d.day_key === day && d.score > score).length + 1 }; }
    if (sql.startsWith("SELECT COUNT(*) + 1 AS r FROM weekly_sum")) { const [week, pid] = a; const mine = weekly.get(pid + "|" + week)?.score ?? 0; return { r: [...weekly.values()].filter((w) => w.week_key === week && w.score > mine).length + 1 }; }
    if (sql.startsWith("SELECT COUNT(*) + 1 AS r FROM players x, (SELECT prestige, xp FROM players WHERE pid = ?) m")) { const [pid] = a; const mine = players.get(pid)?.xp ?? 0; return { r: [...players.values()].filter((p) => p.xp > mine).length + 1 }; }
    if (sql.startsWith("SELECT xp FROM players")) { const [pid] = a; const p = players.get(pid); return p ? { xp: p.xp } : null; }
    if (sql.startsWith("SELECT DISTINCT a.q FROM arena_answers a JOIN arena_runs r")) { const [pid] = a; const ids = new Set(); for (const r of runs) if (r.pid === pid) for (const x of answers.filter((y) => y.run_id === r.id && y.correct)) ids.add(x.q); return [...ids].map((q) => ({ q })); } // v2.9 題海
    if (sql.startsWith("SELECT xp, uc_slug FROM players")) { const [pid] = a; const p = players.get(pid); return p ? { xp: p.xp, uc_slug: p.uc_slug ?? null } : null; } // v2.8 rankStats 也看是否連結帳號
    throw new Error("fake D1 does not know: " + sql);
  };
  const prepare = (sql) => { const stmt = (args) => ({ sql, args, bind: (...b) => stmt(b), first: async () => exec(sql, args), run: async () => (exec(sql, args), { success: true, meta: {} }), all: async () => ({ results: exec(sql, args) || [] }) }); return stmt([]); };
  return { prepare, batch: async (stmts) => stmts.map((s) => (exec(s.sql, s.args), { success: true })), tables: { runs, players, answers, dailyBest, weekly } };
}

const index = JSON.parse(fs.readFileSync(new URL("worker/bank-index.json", root), "utf8"));
const meta = JSON.parse(fs.readFileSync(new URL(`public/bank/meta.${index.version}.json`, root), "utf8"));
/** 從題庫分片找一題，對出索引裡的正確選項（索引只存選項雜湊）。 */
function pickQuestion() {
  const byHash = new Map();
  for (const b of meta.books) { const chunk = JSON.parse(fs.readFileSync(new URL(`public/bank/${b.id}.${index.version}.json`, root), "utf8")); for (const q of chunk.q) for (const o of q.opts) byHash.set(sha16(o), o); }
  for (const [id, e] of Object.entries(index.q)) if (byHash.has(e.a)) return { id, answer: byHash.get(e.a), entry: e };
  throw new Error("no index entry matches a chunk option");
}

test("同一份戰報送兩次：第二次回 duplicate，只入庫一局、詞力只加一次", async () => {
  const { worker, cleanup } = await loadWorker();
  try {
    const db = fakeDb(); const env = { DB: db, SITE_KEY: "wy-word-battle", SITE_TITLE: "字靈收服", PRIMARY_HOST: "wygame.bdfz.net", USER_CENTER_ORIGIN: "https://my.bdfz.net", ASSETS: { fetch: async () => new Response("", { status: 404 }) } };
    const q = pickQuestion(); const startedAt = Date.now() - 12000;
    const payload = { mode: "lesson", scope: "L-test", seed: String(startedAt), nick: "測試", startedAt, answers: [{ q: q.id, pick: q.answer, ms: 1800 }] };
    const send = () => worker.fetch(new Request("https://wygame.bdfz.net/api/run", { method: "POST", headers: { "content-type": "application/json", cookie: "wywb_pid=dedupe-test-pid-0001" }, body: JSON.stringify(payload) }), env);
    const res1 = await send(); const r1 = await res1.json();
    assert.equal(r1.ok, true, res1.status + " " + JSON.stringify(r1)); assert.equal(r1.correct, 1); assert(r1.score > 0, "the picked option must be the correct one"); assert.equal(r1.duplicate, undefined);
    assert.equal(db.tables.runs.length, 1); assert.equal(db.tables.players.get("dedupe-test-pid-0001").xp, r1.score);
    const r2 = await (await send()).json();
    assert.equal(r2.ok, true); assert.equal(r2.duplicate, true); assert.equal(r2.score, r1.score); assert.equal(r2.correct, 1); assert.equal(r2.scored, true); assert.equal(r2.xp, r1.score);
    assert.equal(db.tables.runs.length, 1, "second submission must not insert"); assert.equal(db.tables.answers.length, 1); assert.equal(db.tables.players.get("dedupe-test-pid-0001").xp, r1.score, "xp added once"); assert.equal(db.tables.players.get("dedupe-test-pid-0001").games, 1);
    assert.equal([...db.tables.weekly.values()][0].games, 1);
    assert.equal(r1.xpGain, r1.score); assert.equal(r1.multiplier, 1); assert.equal(r1.repeat, 0); assert.equal(r1.rankIdx, 0); assert.equal(r1.mastered, 0);
    // 同種子、不同起始時刻（真的再打一局）仍然入庫，但同範圍今日第 2 次：詞力折半；第 3 次四分之一；換範圍又是全額
    const send2 = (startedAt, scope = "L-test") => worker.fetch(new Request("https://wygame.bdfz.net/api/run", { method: "POST", headers: { "content-type": "application/json", cookie: "wywb_pid=dedupe-test-pid-0001" }, body: JSON.stringify({ ...payload, scope, startedAt }) }), env).then((r) => r.json());
    const r3 = await send2(startedAt - 60000);
    assert.equal(r3.duplicate, undefined); assert.equal(db.tables.runs.length, 2); assert.equal(r3.repeat, 1); assert.equal(r3.multiplier, 0.5); assert.equal(r3.xpGain, Math.round(r1.score * 0.5)); assert.equal(db.tables.players.get("dedupe-test-pid-0001").xp, r1.score + Math.round(r1.score * 0.5));
    const r4 = await send2(startedAt - 120000); assert.equal(r4.multiplier, 0.25); assert.equal(r4.xpGain, Math.round(r1.score * 0.25));
    assert.equal(r4.mastered, 1, "同一字靈淨答對三次＝收服一隻"); assert.equal(db.tables.players.get("dedupe-test-pid-0001").mastered, 1); assert.equal(r4.cleared, 0, "一題的局不成關（關卡至少三題）");
    const r5 = await send2(startedAt - 180000, "L-other"); assert.equal(r5.multiplier, 1); assert.equal(r5.xpGain, r1.score);
    assert.equal([...db.tables.weekly.values()][0].score, r1.score * 2 + Math.round(r1.score * 0.5) + Math.round(r1.score * 0.25), "本週榜加的是入帳詞力");
  } finally { cleanup(); }
});

test("今日試煉重送：第二次回既有結果，今日排行與詞力都不再加", async () => {
  const { worker, cleanup } = await loadWorker();
  try {
    const db = fakeDb(); const env = { DB: db, SITE_KEY: "wy-word-battle", SITE_TITLE: "字靈收服", PRIMARY_HOST: "wygame.bdfz.net", USER_CENTER_ORIGIN: "https://my.bdfz.net", ASSETS: { fetch: async () => new Response("", { status: 404 }) } };
    const q = pickQuestion(); const startedAt = Date.now() - 9000;
    const payload = { mode: "daily", scope: "daily", seed: "2026-10-28", nick: "", startedAt, answers: [{ q: q.id, pick: q.answer, ms: 2200 }] };
    const send = () => worker.fetch(new Request("https://wygame.bdfz.net/api/run", { method: "POST", headers: { "content-type": "application/json", cookie: "wywb_pid=dedupe-test-pid-0002" }, body: JSON.stringify(payload) }), env);
    const res1 = await send(); const r1 = await res1.json(); assert.equal(r1.scored, true, res1.status + " " + JSON.stringify(r1)); assert.equal(r1.ranks.daily, 1);
    const r2 = await (await send()).json(); assert.equal(r2.duplicate, true); assert.equal(r2.scored, true); assert.equal(r2.ranks.daily, 1); assert.equal(r2.xp, r1.score);
    assert.equal(db.tables.runs.length, 1); assert.equal(db.tables.dailyBest.length, 1); assert.equal(db.tables.players.get("dedupe-test-pid-0002").xp, r1.score);
  } finally { cleanup(); }
});

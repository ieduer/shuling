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
    const db = fakeDb(); const env = { DB: db, SITE_KEY: "shuling", SITE_TITLE: "書靈", PRIMARY_HOST: "shuling.bdfz.net", USER_CENTER_ORIGIN: "https://my.bdfz.net", ASSETS: { fetch: async () => new Response("", { status: 404 }) } };
    const q = pickQuestion(); const startedAt = Date.now() - 12000;
    const payload = { mode: "lesson", scope: "L-test", seed: String(startedAt), nick: "測試", startedAt, answers: [{ q: q.id, pick: q.answer, ms: 1800 }] };
    const send = () => worker.fetch(new Request("https://shuling.bdfz.net/api/run", { method: "POST", headers: { "content-type": "application/json", cookie: "shuling_pid=dedupe-test-pid-0001" }, body: JSON.stringify(payload) }), env);
    const res1 = await send(); const r1 = await res1.json();
    assert.equal(r1.ok, true, res1.status + " " + JSON.stringify(r1)); assert.equal(r1.correct, 1); assert(r1.score > 0, "the picked option must be the correct one"); assert.equal(r1.duplicate, undefined);
    assert.equal(db.tables.runs.length, 1); assert.equal(db.tables.players.get("dedupe-test-pid-0001").xp, r1.score);
    const r2 = await (await send()).json();
    assert.equal(r2.ok, true); assert.equal(r2.duplicate, true); assert.equal(r2.score, r1.score); assert.equal(r2.correct, 1); assert.equal(r2.scored, true); assert.equal(r2.xp, r1.score);
    assert.equal(db.tables.runs.length, 1, "second submission must not insert"); assert.equal(db.tables.answers.length, 1); assert.equal(db.tables.players.get("dedupe-test-pid-0001").xp, r1.score, "xp added once"); assert.equal(db.tables.players.get("dedupe-test-pid-0001").games, 1);
    assert.equal([...db.tables.weekly.values()][0].games, 1);
    assert.equal(r1.xpGain, r1.score); assert.equal(r1.multiplier, 1); assert.equal(r1.repeat, 0); assert.equal(r1.rankIdx, 0); assert.equal(r1.mastered, 0);
    // 同種子、不同起始時刻（真的再打一局）仍然入庫，但同範圍今日第 2 次：詞力折半；第 3 次四分之一；換範圍又是全額
    const send2 = (startedAt, scope = "L-test") => worker.fetch(new Request("https://shuling.bdfz.net/api/run", { method: "POST", headers: { "content-type": "application/json", cookie: "shuling_pid=dedupe-test-pid-0001" }, body: JSON.stringify({ ...payload, scope, startedAt }) }), env).then((r) => r.json());
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
    const db = fakeDb(); const env = { DB: db, SITE_KEY: "shuling", SITE_TITLE: "書靈", PRIMARY_HOST: "shuling.bdfz.net", USER_CENTER_ORIGIN: "https://my.bdfz.net", ASSETS: { fetch: async () => new Response("", { status: 404 }) } };
    const q = pickQuestion(); const startedAt = Date.now() - 9000;
    const payload = { mode: "daily", scope: "daily", seed: "2026-10-28", nick: "", startedAt, answers: [{ q: q.id, pick: q.answer, ms: 2200 }] };
    const send = () => worker.fetch(new Request("https://shuling.bdfz.net/api/run", { method: "POST", headers: { "content-type": "application/json", cookie: "shuling_pid=dedupe-test-pid-0002" }, body: JSON.stringify(payload) }), env);
    const res1 = await send(); const r1 = await res1.json(); assert.equal(r1.scored, true, res1.status + " " + JSON.stringify(r1)); assert.equal(r1.ranks.daily, 1);
    const r2 = await (await send()).json(); assert.equal(r2.duplicate, true); assert.equal(r2.scored, true); assert.equal(r2.ranks.daily, 1); assert.equal(r2.xp, r1.score);
    assert.equal(db.tables.runs.length, 1); assert.equal(db.tables.dailyBest.length, 1); assert.equal(db.tables.players.get("dedupe-test-pid-0002").xp, r1.score);
  } finally { cleanup(); }
});

// 2026-11-04 換版事故：題庫換版後舊雜湊的題庫檔 404，還開著舊頁面的學生跳「書靈召喚失敗」。
// Worker 對舊雜湊改送同名現行檔（no-store、標示兜底）；舊版題目的作答用 worker/bank-index-legacy.json 照樣核分。
import { execFileSync } from "node:child_process";
const legacy = JSON.parse(fs.readFileSync(new URL("worker/bank-index-legacy.json", root), "utf8"));
const assetsFromPublic = { fetch: async (req) => { const p = new URL(req.url).pathname; const f = new URL("public" + p, root); if (!p.startsWith("/bank/") || !fs.existsSync(f)) return new Response("", { status: 404 }); return new Response(req.method === "HEAD" ? null : fs.readFileSync(f), { headers: { "content-type": "application/json", "cache-control": "public, max-age=0, must-revalidate", etag: '"cur"' } }); } };
const envWith = (db) => ({ DB: db, SITE_KEY: "shuling", SITE_TITLE: "書靈", PRIMARY_HOST: "shuling.bdfz.net", USER_CENTER_ORIGIN: "https://my.bdfz.net", ASSETS: assetsFromPublic });

test("舊版題庫索引對得上現行：每一個舊版的題都能核分", () => {
  assert.equal(legacy.current, index.version, "rerun npm run build:legacy-index after build:data");
  for (const v of ["7c11881db8b4", "1b921b91debe"]) assert(legacy.versions.includes(v), v);
  const gitShow = (rev) => JSON.parse(execFileSync("git", ["show", rev], { cwd: root.pathname, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
  for (const sha of execFileSync("git", ["log", "--format=%H", "--", "worker/bank-index.json"], { cwd: root.pathname, encoding: "utf8" }).split("\n").filter(Boolean)) {
    const old = gitShow(`${sha}:worker/bank-index.json`);
    for (const [id, e] of Object.entries(old.q)) {
      const ok = index.q[id] ? index.q[id].a === e.a || (legacy.alt[id] || []).includes(e.a) : (legacy.q[id]?.a || []).includes(e.a);
      assert(ok, `${old.version} ${id}`);
    }
  }
});

test("舊雜湊題庫檔：改送現行檔、200、no-store、標示兜底；現行檔與不存在的書照舊", async () => {
  const { worker, cleanup } = await loadWorker();
  try {
    const env = envWith(fakeDb());
    for (const v of legacy.versions) for (const name of ["meta", "exam", "shi"]) {
      const res = await worker.fetch(new Request(`https://shuling.bdfz.net/bank/${name}.${v}.json`, { headers: { "if-none-match": '"old"' } }), env);
      assert.equal(res.status, 200, `${name}.${v}`);
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.equal(res.headers.get("x-shuling-bank-fallback"), `${v}->${index.version}`);
      assert.equal(res.headers.get("etag"), null);
      assert.equal(await res.text(), fs.readFileSync(new URL(`public/bank/${name}.${index.version}.json`, root), "utf8"));
    }
    const head = await worker.fetch(new Request(`https://shuling.bdfz.net/bank/meta.7c11881db8b4.json`, { method: "HEAD" }), env);
    assert.equal(head.status, 200); assert.equal(head.headers.get("x-shuling-bank-fallback"), `7c11881db8b4->${index.version}`);
    const cur = await worker.fetch(new Request(`https://shuling.bdfz.net/bank/meta.${index.version}.json`), env);
    assert.equal(cur.status, 200); assert.equal(cur.headers.get("x-shuling-bank-fallback"), null);
    assert.equal((await worker.fetch(new Request(`https://shuling.bdfz.net/bank/nosuchbook.7c11881db8b4.json`), env)).status, 404);
    assert.equal((await worker.fetch(new Request(`https://shuling.bdfz.net/bank/meta.7c11881db8b4.json`, { method: "POST" }), env)).status, 404);
  } finally { cleanup(); }
});

test("舊頁面送來舊版題目的作答：照樣核分、寫進作答紀錄", async () => {
  const { worker, cleanup } = await loadWorker();
  try {
    // 從 42714cf（題庫 1b921b91debe，11-04 審校前的現行版）的分片找一題現行題庫已經沒有的題，對出它當時的正確選項
    const oldV = "1b921b91debe";
    const show = (p) => JSON.parse(execFileSync("git", ["show", `42714cf:${p}`], { cwd: root.pathname, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
    const oldMeta = show(`public/bank/meta.${oldV}.json`);
    let found;
    for (const b of oldMeta.books) { for (const q of show(`public/bank/${b.id}.${oldV}.json`).q) { const e = legacy.q[q.id]; if (!e) continue; const ans = q.opts.find((o) => e.a.includes(sha16(o))); if (ans) { found = { id: q.id, answer: ans, wrong: q.opts.find((o) => o !== ans), card: e.c }; break; } } if (found) break; }
    assert(found, "a question retired by the 11-04 bank QA");
    const db = fakeDb(); const env = envWith(db); const startedAt = Date.now() - 15000;
    const res = await worker.fetch(new Request("https://shuling.bdfz.net/api/run", { method: "POST", headers: { "content-type": "application/json", cookie: "shuling_pid=legacy-test-pid-0001" }, body: JSON.stringify({ mode: "lesson", scope: "L-old", seed: "s", nick: "", startedAt, answers: [{ q: found.id, pick: found.answer, ms: 2000 }] }) }), env);
    const r = await res.json();
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.correct, 1); assert(r.score > 0);
    assert.deepEqual(db.tables.answers.map((x) => [x.q, x.card, x.correct]), [[found.id, found.card, 1]]);
    const r2 = await (await worker.fetch(new Request("https://shuling.bdfz.net/api/run", { method: "POST", headers: { "content-type": "application/json", cookie: "shuling_pid=legacy-test-pid-0001" }, body: JSON.stringify({ mode: "lesson", scope: "L-old2", seed: "s", nick: "", startedAt: startedAt - 1, answers: [{ q: found.id, pick: found.wrong, ms: 2000 }] }) }), env)).json();
    assert.equal(r2.ok, true); assert.equal(r2.correct, 0);
  } finally { cleanup(); }
});

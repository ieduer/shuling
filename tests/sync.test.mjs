// 登入用戶中心後跨裝置同步（v2.5）：Worker 以 UC 工作階段 cookie 向 UC 核驗身分；帳號 ↔ 正本 pid；雲端存檔取大合併；
// 裝置匿名戰績可併入正本（審計快照、每日最佳取高分、每週累計相加）；登出後出陣另起匿名 pid；舊 cookie 導回正本。
// 用 esbuild 打包 worker/index.ts，跑在 node:sqlite 的記憶體資料庫上（套用真正的 migrations），UC 以假的 fetch 代替。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../", import.meta.url);
const sha16 = (t) => createHash("sha256").update(t).digest("hex").slice(0, 16);

async function loadWorker() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ziling-sync-"));
  const out = path.join(dir, "worker.mjs");
  await build({ entryPoints: [new URL("worker/index.ts", root).pathname], bundle: true, format: "esm", platform: "neutral", target: "es2022", outfile: out, logLevel: "silent" });
  const mod = await import(out);
  fs.rmSync(dir, { recursive: true, force: true });
  return mod.default;
}

/** D1 介面 → node:sqlite；batch 走交易。 */
function d1(db) {
  const prep = (sql, args = []) => ({
    sql, args, bind: (...b) => prep(sql, b),
    first: async (col) => { const row = db.prepare(sql).get(...args) ?? null; return col ? (row ? row[col] : null) : row; },
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => prep(sql), batch: async (stmts) => { db.exec("BEGIN"); try { const out = stmts.map((s) => (/^\s*select/i.test(s.sql) ? { results: db.prepare(s.sql).all(...s.args) } : (db.prepare(s.sql).run(...s.args), { success: true }))); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
function freshDb() {
  const db = new DatabaseSync(":memory:");
  for (const f of ["0001_arena.sql", "0002_rank.sql", "0003_sync.sql", "0004_prestige.sql"]) db.exec(fs.readFileSync(new URL("migrations/" + f, root), "utf8"));
  return db;
}

// 假的用戶中心：只認 /api/session，cookie 值就是 slug
const users = { u1: { slug: "u1", displayName: "學生一" }, u2: { slug: "u2", displayName: "學生二" }, u3: { slug: "u3", displayName: "學生三" } };
let ucDown = false; let ucCalls = 0;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!u.startsWith("https://my.bdfz.net/api/session")) throw new Error("unexpected fetch " + u);
  ucCalls++;
  if (ucDown) throw new Error("uc down");
  const cookie = String(init?.headers?.cookie || "");
  assert.match(cookie, /^bdfz_uc_session=[^;]+$/, "only the UC session cookie may be forwarded");
  const user = users[cookie.slice("bdfz_uc_session=".length)];
  return new Response(JSON.stringify(user ? { authenticated: true, user } : { authenticated: false, user: null }), { status: 200, headers: { "content-type": "application/json" } });
};

const index = JSON.parse(fs.readFileSync(new URL("worker/bank-index.json", root), "utf8"));
const meta = JSON.parse(fs.readFileSync(new URL(`public/bank/meta.${index.version}.json`, root), "utf8"));
function pickQuestion() {
  const byHash = new Map();
  for (const b of meta.books) { const chunk = JSON.parse(fs.readFileSync(new URL(`public/bank/${b.id}.${index.version}.json`, root), "utf8")); for (const q of chunk.q) for (const o of q.opts) byHash.set(sha16(o), o); }
  for (const [id, e] of Object.entries(index.q)) if (byHash.has(e.a)) return { id, answer: byHash.get(e.a), entry: e };
  throw new Error("no index entry matches a chunk option");
}

const worker = await loadWorker();
const sqlite = freshDb(); const db = d1(sqlite);
const env = { DB: db, SITE_KEY: "wy-word-battle", SITE_TITLE: "字靈收服", PRIMARY_HOST: "wygame.bdfz.net", USER_CENTER_ORIGIN: "https://my.bdfz.net", ASSETS: { fetch: async () => new Response("", { status: 404 }) } };
const q = pickQuestion();
const req = (p, { method = "GET", pid, uc, body, raw } = {}) => new Request("https://wygame.bdfz.net" + p, { method, headers: { "content-type": "application/json", cookie: [pid ? "wywb_pid=" + pid : "", uc ? "bdfz_uc_session=" + uc : ""].filter(Boolean).join("; ") }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
const call = async (p, o) => { const res = await worker.fetch(req(p, o), env); return { status: res.status, body: await res.json(), pid: res.headers.get("set-cookie")?.match(/wywb_pid=([^;]+)/)?.[1] ?? null }; };
let seq = 0;
const run = (pid, uc, scope = "L-test") => { const startedAt = Date.now() - 20000 - 1000 * seq++; return call("/api/run", { method: "POST", pid, uc, body: { mode: "lesson", scope, seed: "s" + seq, nick: "", startedAt, answers: [{ q: q.id, pick: q.answer, ms: 1500 }] } }); };
const count = (sql, ...a) => sqlite.prepare(sql).get(...a).n;
const player = (pid) => sqlite.prepare("SELECT * FROM players WHERE pid = ?").get(pid);
const T0 = 1793300000000;
const save = (over) => ({ v: 1, xp: 0, games: 0, best: 0, bestCombo: 0, totalCorrect: 0, totalAnswered: 0, dayStreak: 0, lastDay: "", daily: {}, q: {}, cards: {}, misses: [], nick: "", sound: false, seenIntro: false, achievements: {}, stages: {}, wins: 0, losses: 0, dayRuns: {}, ...over });

test("未登入或用戶中心連不上：/api/sync 與 /api/save 不寫任何東西", async () => {
  let r = await call("/api/sync", { method: "POST", pid: "pid-anon-00", body: { action: "link" } });
  assert.equal(r.status, 401); assert.equal(r.body.reason, "unauthenticated");
  r = await call("/api/save", { method: "PUT", pid: "pid-anon-00", body: { save: save({ games: 1 }) } });
  assert.equal(r.status, 401);
  ucDown = true;
  r = await call("/api/sync", { method: "POST", pid: "pid-anon-00", uc: "u1", body: { action: "link" } });
  assert.equal(r.status, 503); assert.equal(r.body.reason, "uc_unavailable");
  ucDown = false;
  assert.equal(count("SELECT COUNT(*) AS n FROM players"), 0); assert.equal(count("SELECT COUNT(*) AS n FROM saves"), 0);
  // cookie 值不是合法工作階段（UC 回 authenticated:false）→ 401，且負面結果會快取
  const before = ucCalls;
  r = await call("/api/sync", { method: "POST", pid: "pid-anon-00", uc: "nobody", body: { action: "link" } }); assert.equal(r.status, 401);
  r = await call("/api/sync", { method: "POST", pid: "pid-anon-00", uc: "nobody", body: { action: "link" } }); assert.equal(r.status, 401);
  assert.equal(ucCalls - before, 1, "second lookup served from the identity cache");
});

let xpA = 0;
test("第一次連結：這個 pid 成為帳號正本，存檔存上去、拉得回來；身分核驗十分鐘內只問 UC 一次", async () => {
  const a = await run("pid-AAAA", "u1"); assert.equal(a.status, 200); assert.equal(a.body.ok, true); xpA = a.body.xpGain; assert(xpA > 0);
  const before = ucCalls;
  let r = await call("/api/sync", { method: "POST", pid: "pid-AAAA", uc: "u1", body: { action: "link" } });
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.slug, "u1"); assert.equal(r.body.name, "學生一"); assert.equal(r.body.same, true); assert.equal(r.body.canonical, "pid-AAAA"); assert.equal(r.body.save, null); assert.equal(r.body.serverXp, xpA); assert.equal(r.pid, null, "no cookie change when the pid is already the canonical one");
  assert.equal(player("pid-AAAA").uc_slug, "u1"); assert(player("pid-AAAA").linked_at > 0);
  r = await call("/api/save", { method: "PUT", pid: "pid-AAAA", uc: "u1", body: { save: save({ xp: 300, games: 1, totalAnswered: 9, totalCorrect: 8, cards: { c1: { seen: 3, ok: 3, bad: 0, first: T0, masteredAt: T0 } }, stages: { "L-test": { stars: 3, best: 300, runs: 1 } }, owner: "u1" }) } });
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.changed, false); assert(r.body.bytes > 100);
  const row = sqlite.prepare("SELECT slug, pid, bytes, data FROM saves WHERE slug = 'u1'").get(); assert.equal(row.pid, "pid-AAAA"); assert.equal(JSON.parse(row.data).games, 1); assert.equal("owner" in JSON.parse(row.data), false, "local-only fields never reach the cloud save");
  r = await call("/api/sync", { method: "POST", pid: "pid-AAAA", uc: "u1", body: { action: "link" } }); assert.equal(r.body.save.games, 1); assert.equal(r.body.save.cards.c1.masteredAt, T0); assert(r.body.savedAt > 0);
  assert.equal(ucCalls - before, 1, "one verification for the link call; save and the second link are served from the identity cache");
});

test("第二台裝置（空）：拿到雲端存檔；adopt 後 cookie 改成正本，裝置原 pid 不連結", async () => {
  let r = await call("/api/sync", { method: "POST", pid: "pid-BBBB", uc: "u1", body: { action: "link" } });
  assert.equal(r.body.same, false); assert.equal(r.body.canonical, "pid-AAAA"); assert.equal(r.body.pidHasRuns, false); assert.equal(r.body.foreign, false); assert.equal(r.body.save.games, 1); assert.equal(r.pid, null);
  r = await call("/api/sync", { method: "POST", pid: "pid-BBBB", uc: "u1", body: { action: "adopt" } });
  assert.equal(r.body.ok, true); assert.equal(r.pid, "pid-AAAA", "cookie switched to the canonical pid"); assert.equal(r.body.pid, "pid-AAAA"); assert.equal(r.body.same, true); assert.equal(r.body.merged, false);
  assert.equal(player("pid-BBBB").uc_slug, null); assert.equal(player("pid-BBBB").games, 0);
});

test("第三台裝置先匿名打了一局再登入：merge 把戰績併入正本（快照、對局改指向、週榜相加），之後舊 cookie 導回正本", async () => {
  const c = await run("pid-CCCC"); assert.equal(c.body.ok, true); const xpC = c.body.xpGain; assert.equal(c.body.multiplier, 1, "first run of this scope today for pid-CCCC");
  let r = await call("/api/sync", { method: "POST", pid: "pid-CCCC", uc: "u1", body: { action: "link" } });
  assert.equal(r.body.same, false); assert.equal(r.body.pidHasRuns, true); assert.equal(r.body.canonical, "pid-AAAA");
  r = await call("/api/sync", { method: "POST", pid: "pid-CCCC", uc: "u1", body: { action: "merge" } });
  assert.equal(r.body.ok, true); assert.equal(r.body.merged, true); assert.equal(r.pid, "pid-AAAA"); assert.equal(r.body.serverXp, xpA + xpC);
  assert.equal(count("SELECT COUNT(*) AS n FROM arena_runs WHERE pid = 'pid-CCCC'"), 0); assert.equal(count("SELECT COUNT(*) AS n FROM arena_runs WHERE pid = 'pid-AAAA'"), 2);
  const A = player("pid-AAAA"), C = player("pid-CCCC");
  assert.equal(A.games, 2); assert.equal(A.xp, xpA + xpC); assert.equal(A.uc_slug, "u1"); assert.equal(A.merged_into, null);
  assert.equal(C.merged_into, "pid-AAAA"); assert.equal(C.games, 0); assert.equal(C.xp, 0); assert.equal(C.uc_slug, null);
  const w = sqlite.prepare("SELECT score, games FROM weekly_sum WHERE pid = 'pid-AAAA'").get(); assert.equal(w.games, 2); assert.equal(w.score, xpA + xpC); assert.equal(count("SELECT COUNT(*) AS n FROM weekly_sum WHERE pid = 'pid-CCCC'"), 0);
  const m = sqlite.prepare("SELECT * FROM player_merges").all(); assert.equal(m.length, 1); assert.equal(m[0].from_pid, "pid-CCCC"); assert.equal(m[0].into_pid, "pid-AAAA"); assert.equal(m[0].slug, "u1");
  const snap = JSON.parse(m[0].snapshot); assert.equal(snap.from.xp, xpC); assert.equal(snap.from.games, 1); assert.equal(snap.into.xp, xpA); assert.equal(snap.weekly_from[0].score, xpC);
  assert.equal(A.mastered, 1, "server tallies alone give 0 (net ≥3 not reached); the cloud save already has c1 mastered and v2.8 takes the larger of the two");
  // 舊 cookie（pid-CCCC）再來：導回正本、換 cookie、linked
  r = await call("/api/me", { pid: "pid-CCCC" }); assert.equal(r.body.pid, "pid-AAAA"); assert.equal(r.pid, "pid-AAAA"); assert.equal(r.body.linked, true); assert.equal(r.body.games, 2);
  // 併入後同範圍今日已有兩局 → 第三局 ×0.25（遞減跟著正本算）
  const again = await run("pid-AAAA", "u1"); assert.equal(again.body.repeat, 2); assert.equal(again.body.multiplier, 0.25);
  assert.equal(again.body.mastered, 1, "third net-correct answer on the same card masters it");
  // 再 merge 一次（已是正本）→ 不再動資料
  r = await call("/api/sync", { method: "POST", pid: "pid-AAAA", uc: "u1", body: { action: "merge" } }); assert.equal(r.body.same, true); assert.equal(r.body.merged, false); assert.equal(count("SELECT COUNT(*) AS n FROM player_merges"), 1);
});

test("登出後出陣：另起匿名 pid，帳號的戰績不被續寫；讀取不另起", async () => {
  const gamesBefore = player("pid-AAAA").games;
  const r = await run("pid-AAAA"); assert.equal(r.body.ok, true); assert(r.pid && r.pid !== "pid-AAAA", "a new anonymous pid cookie");
  assert.equal(player("pid-AAAA").games, gamesBefore); assert.equal(player(r.pid).games, 1); assert.equal(player(r.pid).uc_slug, null);
  const me = await call("/api/me", { pid: "pid-AAAA" }); assert.equal(me.body.pid, "pid-AAAA"); assert.equal(me.pid, null, "reads keep the pid");
  const board = await call("/api/leaderboard?period=all", { pid: "pid-AAAA" }); assert.equal(board.status, 200); assert.equal(board.body.me.games, gamesBefore);
});

test("雲端存檔合併取大：少的那份送上去不會把多的蓋掉，回傳合併後的存檔", async () => {
  const r = await call("/api/save", { method: "PUT", pid: "pid-AAAA", uc: "u1", body: { save: save({ xp: 10, games: 0, cards: { c2: { seen: 3, ok: 3, bad: 0, first: T0 + 1, masteredAt: T0 + 1 } }, nick: "乙" }) } });
  assert.equal(r.status, 200); assert.equal(r.body.changed, true); assert.equal(r.body.save.games, 1); assert.equal(r.body.save.xp, 300); assert.equal(r.body.save.cards.c1.masteredAt, T0); assert.equal(r.body.save.cards.c2.masteredAt, T0 + 1); assert.equal(r.body.save.nick, "乙"); assert.equal(r.body.save.stages["L-test"].stars, 3);
  const stored = JSON.parse(sqlite.prepare("SELECT data FROM saves WHERE slug = 'u1'").get().data); assert.equal(Object.keys(stored.cards).length, 2); assert.equal(stored.games, 1);
});

test("別人的裝置：pid 屬於 u2 時 u1 登入只會 adopt 正本、u3（沒有正本）登入會另起新 pid；u2 的 pid 不動", async () => {
  let r = await call("/api/sync", { method: "POST", pid: "pid-FFFF", uc: "u2", body: { action: "link" } }); assert.equal(r.body.same, true); assert.equal(player("pid-FFFF").uc_slug, "u2");
  r = await call("/api/sync", { method: "POST", pid: "pid-FFFF", uc: "u1", body: { action: "link" } }); assert.equal(r.body.foreign, true); assert.equal(r.body.same, false); assert.equal(r.body.pidHasRuns, false); assert.equal(r.body.canonical, "pid-AAAA");
  r = await call("/api/sync", { method: "POST", pid: "pid-FFFF", uc: "u1", body: { action: "merge" } }); assert.equal(r.body.merged, false, "a foreign pid is never merged"); assert.equal(r.pid, "pid-AAAA");
  assert.equal(player("pid-FFFF").uc_slug, "u2"); assert.equal(player("pid-FFFF").merged_into, null);
  r = await call("/api/sync", { method: "POST", pid: "pid-FFFF", uc: "u3", body: { action: "link" } }); assert.equal(r.body.same, true); assert(r.pid && r.pid !== "pid-FFFF", "u3 gets a fresh canonical pid"); assert.equal(player(r.pid).uc_slug, "u3"); assert.equal(player("pid-FFFF").uc_slug, "u2");
  assert.equal(count("SELECT COUNT(*) AS n FROM players WHERE uc_slug = 'u1' AND merged_into IS NULL"), 1, "exactly one canonical pid per account");
});

test("壞存檔 400、超過上限 413；/api/me 於未連結 pid 回 linked:false", async () => {
  let r = await call("/api/save", { method: "PUT", pid: "pid-AAAA", uc: "u1", body: { save: "x" } }); assert.equal(r.status, 400); assert.equal(r.body.reason, "bad_save");
  r = await call("/api/save", { method: "PUT", pid: "pid-AAAA", uc: "u1", raw: '{"save":{"v":1,"nick":"' + "x".repeat(1_000_100) + '"}}' }); assert.equal(r.status, 413);
  r = await call("/api/me", { pid: "pid-BBBB" }); assert.equal(r.body.linked, false);
  assert.equal(count("SELECT COUNT(*) AS n FROM saves"), 1);
});

// 書靈：期望段位由當前關卡數算出（30000 學力＋450 收服＋全部關卡三星＋各域全通），題庫增關不必改測試。
const LESSONS_ALL = JSON.parse(fs.readFileSync(new URL("worker/lessons.json", root), "utf8")).lessons;
const { REGION_BOOKS: RB } = await import(new URL("src/engine/rank.ts", root).href);
const EXP_PRESTIGE = 30000 + 450 * 30 + LESSONS_ALL.filter((l) => l.questions >= 3).length * 120 + RB.length * 2500;
const { RANKS: RANK_DEFS } = await import(new URL("src/engine/score.ts", root).href);
const EXP_IDX = RANK_DEFS.findLastIndex((r) => !r.all && r.xp <= EXP_PRESTIGE);

test("排行榜段位不低於玩家看到的（2026-10-31）：雲端存檔算出文曲時，PUT /api/save 與 link 都把 players 的段位對齊；戰報算的取大、詞力仍以伺服器為準", async () => {
  const lessons = JSON.parse(fs.readFileSync(new URL("worker/lessons.json", root), "utf8")).lessons;
  const stages = Object.fromEntries(lessons.filter((l) => l.questions >= 3).map((l) => [l.id, { stars: 3, best: 1, runs: 1 }]));
  const cards = Object.fromEntries(Array.from({ length: 450 }, (_, i) => ["cx" + i, { seen: 3, ok: 3, bad: 0, first: T0, masteredAt: T0 }]));
  const before = player("pid-AAAA"); assert(before.rank_idx < EXP_IDX);
  let r = await call("/api/save", { method: "PUT", pid: "pid-AAAA", uc: "u1", body: { save: save({ xp: 30000, games: 500, cards, stages }) } });
  assert.equal(r.status, 200); assert.equal(r.body.ok, true);
  let after = player("pid-AAAA"); assert.equal(after.rank_idx, EXP_IDX, "30000 + 450×30 + 關卡×120 + 2×2500 = " + EXP_PRESTIGE); assert(after.mastered >= 450); assert(after.cleared >= LESSONS_ALL.length);
  assert.equal(after.xp, before.xp, "the save never changes server xp"); assert.equal(after.games, before.games, "nor games");
  r = await call("/api/me", { pid: "pid-AAAA", uc: "u1" }); assert.equal(r.body.rankIdx, EXP_IDX); assert.equal(r.body.linked, true); assert(r.body.prestige >= EXP_PRESTIGE && r.body.prestige <= EXP_PRESTIGE + 700, "學力 = " + r.body.prestige);
  // 戰報算的段位仍低：再打一局不會把榜上段位拉回去；詞力照戰報加
  const g = await run("pid-AAAA", "u1"); assert.equal(g.body.ok, true); assert.equal(g.body.rankIdx, EXP_IDX);
  after = player("pid-AAAA"); assert.equal(after.rank_idx, EXP_IDX); assert.equal(after.xp, before.xp + g.body.xpGain);
  // 舊玩家開站 link 就對齊，不必再打一局
  sqlite.prepare("UPDATE players SET rank_idx = 0, mastered = 0, cleared = 0 WHERE pid = 'pid-AAAA'").run();
  r = await call("/api/sync", { method: "POST", pid: "pid-AAAA", uc: "u1", body: { action: "link" } }); assert.equal(r.body.ok, true);
  assert.equal(player("pid-AAAA").rank_idx, EXP_IDX); assert(player("pid-AAAA").prestige >= EXP_PRESTIGE + g.body.xpGain);
  // 未連結的 pid 不看存檔
  assert.equal(player("pid-BBBB").rank_idx, 0);
});

test("總榜＝詞力（對局入帳＋成就加成，v2.10）：詞力高者在前、同詞力再比對局入帳；名次與 /api/run 的 ranks.all 一致；本週榜每局都加入帳詞力（含今日試煉再練）", async () => {
  const lb = await call("/api/leaderboard?period=all", { pid: "pid-AAAA", uc: "u1" }); assert.equal(lb.status, 200); const rows = lb.body.rows; assert(rows.length >= 2);
  for (let i = 1; i < rows.length; i++) assert(rows[i - 1].score > rows[i].score || (rows[i - 1].score === rows[i].score && rows[i - 1].xp >= rows[i].xp), "rows ordered by 詞力 (prestige) then run xp");
  // 詞力更高的狀元以下排在文曲之前
  const otherRow = sqlite.prepare("SELECT pid FROM players WHERE games > 0 AND pid <> 'pid-AAAA' ORDER BY xp DESC LIMIT 1").get(); assert(otherRow);
  const minePr = sqlite.prepare("SELECT prestige FROM players WHERE pid = 'pid-AAAA'").get().prestige; sqlite.prepare("UPDATE players SET prestige = ? WHERE pid = ?").run(minePr + 5000, otherRow.pid);
  const lb2 = await call("/api/leaderboard?period=all", { pid: "pid-AAAA", uc: "u1" }); const rows2 = lb2.body.rows;
  assert.equal(rows2[0].score, minePr + 5000); assert.equal(rows2[0].me, false); assert(rows2[0].rankIdx < EXP_IDX, "a lower tier with more 學力 sits first"); const mine = rows2.find((r) => r.me); assert(mine && mine.rank >= 2 && mine.rankIdx === EXP_IDX);
  const g = await run("pid-AAAA", "u1"); assert.equal(g.body.ok, true); const lb3 = await call("/api/leaderboard?period=all", { pid: "pid-AAAA", uc: "u1" }); assert.equal(g.body.ranks.all, lb3.body.rows.find((r) => r.me).rank, "ranks.all matches the board position");
  // 本週榜：今日試煉首戰入今日榜；再練不入今日榜（daily_done）但遞減詞力照加進本週榜與總榜
  const weekBefore = sqlite.prepare("SELECT score, games FROM weekly_sum WHERE pid = 'pid-AAAA'").get();
  const daily = (n) => { const startedAt = Date.now() - 20000 - 1000 * seq++; return call("/api/run", { method: "POST", pid: "pid-AAAA", uc: "u1", body: { mode: "daily", scope: "daily", seed: "d" + n, nick: "", startedAt, answers: [{ q: q.id, pick: q.answer, ms: 1500 }] } }); };
  const d1r = await daily(1); assert.equal(d1r.body.scored, true); assert(d1r.body.xpGain > 0);
  const d2r = await daily(2); assert.equal(d2r.body.scored, false); assert.equal(d2r.body.reason, "daily_done"); assert(d2r.body.xpGain > 0 && d2r.body.multiplier === 0.5, JSON.stringify(d2r.body));
  const weekAfter = sqlite.prepare("SELECT score, games FROM weekly_sum WHERE pid = 'pid-AAAA'").get();
  assert.equal(weekAfter.score - weekBefore.score, d1r.body.xpGain + d2r.body.xpGain, "both daily runs add their credited xp to the weekly board"); assert.equal(weekAfter.games - weekBefore.games, 2);
  assert.equal(count("SELECT COUNT(*) AS n FROM daily_best WHERE pid = 'pid-AAAA'"), 1, "only the first daily attempt is on the daily board");
});

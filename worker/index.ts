/** 書靈 Worker：靜態資產 + 伺服器核分 + 排行榜。
 * 分數不信任客戶端：每局答案以題庫索引（選項雜湊、稀有度、題型）重算，公式與前端共用 src/engine/score.ts。 */
import bankIndex from "./bank-index.json";
import lessonsIndex from "./lessons.json";
import { questionScore, LIMIT_MS, RUN_SIZE, prestigeOf, rankIdxOf } from "../src/engine/score";
import { clearedStats, creditXp, masteredFromTallies, repeatMultiplier } from "../src/engine/rank";
import { mergeSaves, normalizeSave, SAVE_MAX_BYTES, serializeSave, utf8Bytes, type SaveShape } from "../src/engine/save";
import { saveRankStats } from "../src/engine/save-rank";
import { ucCookie, ucIdentity } from "./uc";
import type { QType, Tier } from "../src/engine/types";

interface Env {
  DB?: D1Database;
  ASSETS: Fetcher;
  SITE_KEY: string;
  SITE_TITLE: string;
  PRIMARY_HOST: string;
  USER_CENTER_ORIGIN: string;
}

interface IndexEntry {
  c: string;
  a: string;
  t: QType;
  r: Tier;
}
const INDEX = bankIndex as { version: string; q: Record<string, IndexEntry> };
const QIDS = new Set(Object.keys(INDEX.q)); // 題海分母＝現行題庫的題（文曲之上的段位看答對過一次的題數）
const MODES = new Set(["daily", "free", "wrong", "lesson"]);
const TZ_OFFSET_MS = 8 * 3600 * 1000; // 兩岸都是 UTC+8，日界線用北京／臺北時間

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(init.headers || {}) } });
}

function dayKeyOf(ts: number): string {
  return new Date(ts + TZ_OFFSET_MS).toISOString().slice(0, 10);
}
function weekKeyOf(ts: number): string {
  const d = new Date(ts + TZ_OFFSET_MS);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function sha16(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function cleanNick(v: unknown): string {
  return String(v || "")
    .replace(/[\u0000-\u001f\u007f<>"'`\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
}

function getPid(request: Request): { pid: string; fresh: boolean } {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)shuling_pid=([A-Za-z0-9-]{8,64})/);
  if (m) return { pid: m[1], fresh: false };
  return { pid: crypto.randomUUID(), fresh: true };
}
function pidCookie(request: Request, pid: string): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `shuling_pid=${pid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=63072000${secure}`;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function ensurePlayer(db: D1Database, pid: string, now: number): Promise<void> {
  await db
    .prepare("INSERT INTO players (pid, nick, xp, games, best, created_at, last_seen) VALUES (?, '', 0, 0, 0, ?, ?) ON CONFLICT(pid) DO UPDATE SET last_seen = excluded.last_seen")
    .bind(pid, now, now)
    .run();
}

interface PlayerLink {
  uc_slug: string | null;
  merged_into: string | null;
  games: number;
}
interface PidCtx {
  pid: string;
  headers: Record<string, string>;
  row: PlayerLink | null;
}
const linkOf = (db: D1Database, pid: string) => db.prepare("SELECT uc_slug, merged_into, games FROM players WHERE pid = ?").bind(pid).first<PlayerLink>();

/** 解析這個請求的玩家 pid（v2.5）：
 * - cookie 指到一個已併入帳號正本的舊 pid（另一個分頁、舊 cookie）→ 改用正本 pid 並換 cookie；
 * - 寫入型請求來自已連結帳號的裝置、但請求上沒有用戶中心的工作階段 cookie（已登出／過期）→ 另起一個匿名 pid，帳號的戰績不會被別人續寫；
 * 讀取型請求不另起 pid。 */
async function resolvePid(request: Request, db: D1Database | undefined, mutating: boolean): Promise<PidCtx> {
  let { pid, fresh } = getPid(request);
  const headers: Record<string, string> = {};
  let row: PlayerLink | null = null;
  if (db && !fresh) {
    row = await linkOf(db, pid);
    for (let hop = 0; row?.merged_into && hop < 3; hop++) {
      pid = row.merged_into;
      fresh = true;
      row = await linkOf(db, pid);
    }
    if (mutating && row?.uc_slug && !ucCookie(request)) {
      pid = crypto.randomUUID();
      fresh = true;
      row = null;
    }
  }
  if (fresh) headers["set-cookie"] = pidCookie(request, pid);
  return { pid, headers, row };
}

async function submitRun(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const ctx = await resolvePid(request, env.DB, true);
  const pid = ctx.pid;
  const now = Date.now();
  const mode = String(body.mode || "");
  const seed = String(body.seed || "").slice(0, 64);
  const scope = String(body.scope || "").slice(0, 40);
  const nick = cleanNick(body.nick);
  const startedAt = Number(body.startedAt) || now;
  const raw = Array.isArray(body.answers) ? (body.answers as unknown[]) : [];
  if (!MODES.has(mode) || raw.length === 0 || raw.length > RUN_SIZE + 2) return json({ ok: false, reason: "bad_request" }, { status: 400 });
  const duration = Math.max(0, now - startedAt);
  if (duration < 3000) return json({ ok: false, reason: "too_fast" }, { status: 400 });

  // 重算
  let combo = 0;
  let score = 0;
  let correct = 0;
  let maxCombo = 0;
  const rows: { q: string; card: string; correct: boolean; ms: number }[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const a = item as { q?: unknown; pick?: unknown; ms?: unknown };
    const q = String(a.q || "");
    const entry = INDEX.q[q];
    if (!entry || seen.has(q)) continue;
    seen.add(q);
    const pick = String(a.pick ?? "");
    const ms = Math.min(LIMIT_MS, Math.max(0, Number(a.ms) || 0));
    const ok = pick !== "" && (await sha16(pick)) === entry.a;
    combo = ok ? combo + 1 : 0;
    maxCombo = Math.max(maxCombo, combo);
    if (ok) correct++;
    score += questionScore({ correct: ok, tier: entry.r, type: entry.t, ms, combo });
    rows.push({ q, card: entry.c, correct: ok, ms });
  }
  if (!rows.length) return json({ ok: false, reason: "no_valid_answers" }, { status: 400 });

  const dayKey = dayKeyOf(now);
  const weekKey = weekKeyOf(now);
  let scored = true;
  let reason: string | undefined;
  const headers = ctx.headers;

  if (!env.DB) return json({ ok: true, scored: false, score, correct, xp: score, ranks: { daily: null, weekly: null, all: null }, reason: "no_db" }, { headers });

  const db = env.DB;
  await ensurePlayer(db, pid, now);
  // 同一份戰報重送（瀏覽器或網路在回應遺失後重發同一個 POST）：同玩家、同模式、同範圍、同種子、同起始時刻只入庫一次，
  // 第二次回傳既有結果、不再加學力。startedAt 過了 too_fast 守衛必小於 now，入庫列滿足 created_at - duration_ms = startedAt。
  const dup = await db
    .prepare("SELECT id, score, correct, scored FROM arena_runs WHERE pid = ? AND mode = ? AND scope = ? AND seed = ? AND created_at - duration_ms = ? LIMIT 1")
    .bind(pid, mode, scope, seed, startedAt)
    .first<{ id: string; score: number; correct: number; scored: number }>();
  if (dup) {
    const wasScored = dup.scored === 1;
    const r = await ranksFor(db, pid, dayKey, weekKey, mode === "daily" && wasScored ? dup.score : null);
    return json(
      { ok: true, scored: wasScored, reason: wasScored ? undefined : mode === "daily" ? "daily_done" : undefined, duplicate: true, score: dup.score, correct: dup.correct, xp: r.xp ?? dup.score, xpGain: 0, multiplier: 0, rankIdx: r.rankIdx, mastered: r.mastered, cleared: r.cleared, ranks: r.ranks },
      { headers },
    );
  }
  if (mode === "daily") {
    const prev = await db.prepare("SELECT score FROM daily_best WHERE pid = ? AND day_key = ?").bind(pid, dayKey).first<{ score: number }>();
    if (prev) {
      scored = false;
      reason = "daily_done";
    }
  }
  // 同範圍同日重複出陣：學力遞減（第 1 次全額、第 2 次一半、第 3 次四分之一、之後一成）。單局分數（今日排行）仍是原始分。
  const prior = (await db.prepare("SELECT COUNT(*) AS n FROM arena_runs WHERE pid = ? AND scope = ? AND day_key = ?").bind(pid, scope, dayKey).first<{ n: number }>())?.n || 0;
  const multiplier = repeatMultiplier(prior);
  const credited = creditXp(score, prior);
  const runId = crypto.randomUUID();
  const stmts: D1PreparedStatement[] = [
    db
      .prepare("INSERT INTO arena_runs (id, pid, mode, scope, seed, day_key, week_key, score, correct, total, max_combo, duration_ms, scored, bank_v, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(runId, pid, mode, scope, seed, dayKey, weekKey, score, correct, rows.length, maxCombo, duration, scored ? 1 : 0, INDEX.version, now),
    db.prepare("UPDATE players SET xp = xp + ?, games = games + 1, best = MAX(best, ?), last_seen = ?, nick = CASE WHEN ? = '' THEN nick ELSE ? END WHERE pid = ?").bind(credited, score, now, nick, nick, pid),
  ];
  for (const r of rows) stmts.push(db.prepare("INSERT OR IGNORE INTO arena_answers (run_id, q, card, correct, ms) VALUES (?, ?, ?, ?, ?)").bind(runId, r.q, r.card, r.correct ? 1 : 0, r.ms));
  // 今日榜＝今日試煉首戰的原始分（每天只計一次）；本週榜＝本週累計入帳學力（每一局都算，含再練的遞減學力，與總榜同一把尺；2026-10-31 v2.10）
  if (scored && mode === "daily") stmts.push(db.prepare("INSERT INTO daily_best (pid, day_key, score, run_id, at) VALUES (?, ?, ?, ?, ?)").bind(pid, dayKey, score, runId, now));
  stmts.push(
    db
      .prepare("INSERT INTO weekly_sum (pid, week_key, score, games) VALUES (?, ?, ?, 1) ON CONFLICT(pid, week_key) DO UPDATE SET score = score + excluded.score, games = games + 1")
      .bind(pid, weekKey, credited),
  );
  await db.batch(stmts);

  const st = await rankStats(db, pid);
  const r = await ranksFor(db, pid, dayKey, weekKey, mode === "daily" && scored ? score : null);
  return json({ ok: true, scored, reason, score, correct, xp: r.xp ?? score, xpGain: credited, multiplier, repeat: prior, rankIdx: st.rankIdx, mastered: st.mastered, cleared: st.cleared, regions: st.regions, prestige: st.prestige, ranks: r.ranks }, { headers });
}

/** 段位統計（伺服器版，依已送達的戰報）：收服＝淨答對三次以上的書靈；通關＝該課有一局全對；全通域＝域內每一關都全對。
 * 寫回 players（mastered／cleared／rank_idx）供排行榜顯示；規則與前端 rankStatsOf 相同（旅程關卡清單來自 worker/lessons.json）。 */
async function rankStats(db: D1Database, pid: string, save?: SaveShape): Promise<{ mastered: number; cleared: number; regions: number; rankIdx: number; prestige: number }> {
  const [tallies, perfect, me, doneRows] = await Promise.all([
    db.prepare("SELECT SUM(a.correct) AS ok, COUNT(*) - SUM(a.correct) AS bad FROM arena_answers a JOIN arena_runs r ON r.id = a.run_id WHERE r.pid = ? GROUP BY a.card").bind(pid).all<{ ok: number; bad: number }>(),
    db.prepare("SELECT DISTINCT scope FROM arena_runs WHERE pid = ? AND mode = 'lesson' AND correct = total AND total >= 3").bind(pid).all<{ scope: string }>(),
    db.prepare("SELECT xp, uc_slug FROM players WHERE pid = ?").bind(pid).first<{ xp: number; uc_slug: string | null }>(),
    db.prepare("SELECT DISTINCT a.q FROM arena_answers a JOIN arena_runs r ON r.id = a.run_id WHERE r.pid = ? AND a.correct = 1").bind(pid).all<{ q: string }>(),
  ]);
  const perfectSet = new Set((perfect.results || []).map((x) => x.scope));
  let mastered = masteredFromTallies(tallies.results || []);
  const c = clearedStats((id) => (perfectSet.has(id) ? 3 : 0), lessonsIndex.lessons);
  let cleared = c.cleared;
  let regions = c.regions;
  // 題海（2026-10-31 文曲之上）：戰報裡答對過一次、且仍在題庫裡的題數
  let done = 0;
  for (const row of doneRows.results || []) if (QIDS.has(row.q)) done++;
  // 學力＝對局入帳＋成就加成（v2.10 成就併入學力）；段位與總榜都看這個數
  let prestige = prestigeOf({ xp: me?.xp || 0, mastered, cleared, regions, done });
  // 已連結帳號：再看雲端存檔（裝置上看到的進度），四項各取大、段位取高——榜上段位不低於玩家自己看到的（2026-10-31，見 src/engine/save-rank.ts）
  if (me?.uc_slug) {
    const cloud = save ?? (await loadSave(db, me.uc_slug))?.save;
    if (cloud) {
      const d = saveRankStats(cloud, lessonsIndex.lessons, QIDS);
      mastered = Math.max(mastered, d.mastered);
      cleared = Math.max(cleared, d.cleared);
      regions = Math.max(regions, d.regions);
      done = Math.max(done, d.done || 0);
      prestige = Math.max(prestige, prestigeOf(d));
    }
  }
  const rankIdx = rankIdxOf(prestige, done, QIDS.size);
  await db.prepare("UPDATE players SET mastered = ?, cleared = ?, rank_idx = ?, prestige = ? WHERE pid = ?").bind(mastered, cleared, rankIdx, prestige, pid).run();
  return { mastered, cleared, regions, rankIdx, prestige };
}

/** 今日／本週／總榜名次與現在學力。dailyScore 只在計入今日排行的日戰時給。 */
async function ranksFor(db: D1Database, pid: string, dayKey: string, weekKey: string, dailyScore: number | null): Promise<{ ranks: { daily: number | null; weekly: number | null; all: number | null }; xp: number | null; rankIdx: number; mastered: number; cleared: number }> {
  const [dailyRank, weeklyRank, allRank, me] = await Promise.all([
    dailyScore !== null ? db.prepare("SELECT COUNT(*) + 1 AS r FROM daily_best WHERE day_key = ? AND score > ?").bind(dayKey, dailyScore).first<{ r: number }>() : Promise.resolve(null),
    db
      .prepare("SELECT COUNT(*) + 1 AS r FROM weekly_sum WHERE week_key = ? AND score > (SELECT COALESCE(score, 0) FROM weekly_sum WHERE pid = ? AND week_key = ?)")
      .bind(weekKey, pid, weekKey)
      .first<{ r: number }>(),
    // 總榜名次＝學力（對局入帳＋成就加成，players.prestige）；同學力再比對局入帳（2026-10-31 v2.10 成就併入學力，排行與段位一條尺）
    db.prepare("SELECT COUNT(*) + 1 AS r FROM players x, (SELECT prestige, xp FROM players WHERE pid = ?) m WHERE x.games > 0 AND (x.prestige > m.prestige OR (x.prestige = m.prestige AND x.xp > m.xp))").bind(pid).first<{ r: number }>(),
    db.prepare("SELECT xp, mastered, cleared, rank_idx FROM players WHERE pid = ?").bind(pid).first<{ xp: number; mastered: number; cleared: number; rank_idx: number }>(),
  ]);
  return { ranks: { daily: dailyRank?.r ?? null, weekly: weeklyRank?.r ?? null, all: allRank?.r ?? null }, xp: me?.xp ?? null, rankIdx: me?.rank_idx ?? 0, mastered: me?.mastered ?? 0, cleared: me?.cleared ?? 0 };
}

async function leaderboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") === "weekly" ? "weekly" : url.searchParams.get("period") === "all" ? "all" : "daily";
  const { pid, headers } = await resolvePid(request, env.DB, false);
  const now = Date.now();
  const key = period === "daily" ? dayKeyOf(now) : period === "weekly" ? weekKeyOf(now) : "all";
  if (!env.DB) return json({ period, key, rows: [], me: null, players: 0 });
  const db = env.DB;
  let rows: { pid: string; nick: string; score: number; xp: number; games: number; rank_idx: number; mastered: number }[] = [];
  let players = 0;
  if (period === "daily") {
    const r = await db
      .prepare("SELECT d.pid, p.nick, d.score, p.xp, p.games, p.rank_idx, p.mastered FROM daily_best d JOIN players p ON p.pid = d.pid WHERE d.day_key = ? ORDER BY d.score DESC, d.at ASC LIMIT 50")
      .bind(key)
      .all<{ pid: string; nick: string; score: number; xp: number; games: number; rank_idx: number; mastered: number }>();
    rows = r.results || [];
    players = (await db.prepare("SELECT COUNT(*) AS n FROM daily_best WHERE day_key = ?").bind(key).first<{ n: number }>())?.n || 0;
  } else if (period === "weekly") {
    const r = await db
      .prepare("SELECT w.pid, p.nick, w.score, p.xp, w.games, p.rank_idx, p.mastered FROM weekly_sum w JOIN players p ON p.pid = w.pid WHERE w.week_key = ? ORDER BY w.score DESC LIMIT 50")
      .bind(key)
      .all<{ pid: string; nick: string; score: number; xp: number; games: number; rank_idx: number; mastered: number }>();
    rows = r.results || [];
    players = (await db.prepare("SELECT COUNT(*) AS n FROM weekly_sum WHERE week_key = ?").bind(key).first<{ n: number }>())?.n || 0;
  } else {
    const r = await db.prepare("SELECT pid, nick, prestige AS score, xp, games, rank_idx, mastered FROM players WHERE games > 0 ORDER BY prestige DESC, xp DESC, games ASC LIMIT 50").all<{ pid: string; nick: string; score: number; xp: number; games: number; rank_idx: number; mastered: number }>();
    rows = r.results || [];
    players = (await db.prepare("SELECT COUNT(*) AS n FROM players WHERE games > 0").first<{ n: number }>())?.n || 0;
  }
  const out = rows.map((r, i) => ({ rank: i + 1, nick: r.nick, score: r.score, xp: r.xp, games: r.games, rankIdx: r.rank_idx ?? 0, mastered: r.mastered ?? 0, me: r.pid === pid }));
  let me = out.find((r) => r.me) || null;
  if (!me) {
    if (period === "daily") {
      const mine = await db.prepare("SELECT d.score, p.nick, p.xp, p.games, p.rank_idx, p.mastered, (SELECT COUNT(*) + 1 FROM daily_best x WHERE x.day_key = d.day_key AND x.score > d.score) AS r FROM daily_best d JOIN players p ON p.pid = d.pid WHERE d.pid = ? AND d.day_key = ?").bind(pid, key).first<{ score: number; nick: string; xp: number; games: number; rank_idx: number; mastered: number; r: number }>();
      if (mine) me = { rank: mine.r, nick: mine.nick, score: mine.score, xp: mine.xp, games: mine.games, rankIdx: mine.rank_idx ?? 0, mastered: mine.mastered ?? 0, me: true };
    } else if (period === "weekly") {
      const mine = await db.prepare("SELECT w.score, p.nick, p.xp, w.games, p.rank_idx, p.mastered, (SELECT COUNT(*) + 1 FROM weekly_sum x WHERE x.week_key = w.week_key AND x.score > w.score) AS r FROM weekly_sum w JOIN players p ON p.pid = w.pid WHERE w.pid = ? AND w.week_key = ?").bind(pid, key).first<{ score: number; nick: string; xp: number; games: number; rank_idx: number; mastered: number; r: number }>();
      if (mine) me = { rank: mine.r, nick: mine.nick, score: mine.score, xp: mine.xp, games: mine.games, rankIdx: mine.rank_idx ?? 0, mastered: mine.mastered ?? 0, me: true };
    } else {
      const mine = await db.prepare("SELECT xp, prestige, nick, games, rank_idx, mastered, (SELECT COUNT(*) + 1 FROM players x WHERE x.games > 0 AND (x.prestige > p.prestige OR (x.prestige = p.prestige AND x.xp > p.xp))) AS r FROM players p WHERE pid = ? AND games > 0").bind(pid).first<{ xp: number; prestige: number; nick: string; games: number; rank_idx: number; mastered: number; r: number }>();
      if (mine) me = { rank: mine.r, nick: mine.nick, score: mine.prestige, xp: mine.xp, games: mine.games, rankIdx: mine.rank_idx ?? 0, mastered: mine.mastered ?? 0, me: true };
    }
  }
  return json({ period, key, rows: out, me, players }, { headers: { "cache-control": "no-store", ...headers } });
}

async function meHandler(request: Request, env: Env): Promise<Response> {
  const { pid, headers, row } = await resolvePid(request, env.DB, false);
  if (!env.DB) return json({ pid, nick: "", xp: 0, games: 0, best: 0, todayScored: false, linked: false }, { headers });
  const p = await env.DB.prepare("SELECT nick, xp, games, best, mastered, cleared, rank_idx, prestige FROM players WHERE pid = ?").bind(pid).first<{ nick: string; xp: number; games: number; best: number; mastered: number; cleared: number; rank_idx: number; prestige: number }>();
  const d = await env.DB.prepare("SELECT 1 AS x FROM daily_best WHERE pid = ? AND day_key = ?").bind(pid, dayKeyOf(Date.now())).first();
  return json({ pid, nick: p?.nick || "", xp: p?.xp || 0, games: p?.games || 0, best: p?.best || 0, todayScored: !!d, rankIdx: p?.rank_idx ?? 0, mastered: p?.mastered ?? 0, cleared: p?.cleared ?? 0, prestige: p?.prestige ?? 0, linked: !!row?.uc_slug }, { headers });
}

async function nickHandler(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const { pid, headers } = await resolvePid(request, env.DB, true);
  const nick = cleanNick(body.nick);
  const now = Date.now();
  if (!env.DB) return json({ pid, nick, xp: 0, games: 0, best: 0, todayScored: false, linked: false }, { headers });
  await ensurePlayer(env.DB, pid, now);
  await env.DB.prepare("UPDATE players SET nick = ?, last_seen = ? WHERE pid = ?").bind(nick, now, pid).run();
  return meHandler(new Request(request.url, { headers: { cookie: `shuling_pid=${pid}` } }), env).then(async (r) => new Response(await r.text(), { headers: { ...Object.fromEntries(r.headers), ...headers } }));
}

/* ---------- v2.5 登入用戶中心後跨裝置同步 ----------
 * 帳號（UC slug）↔ 正本 pid：players.uc_slug 指向帳號、merged_into 為空的那一列。各裝置登入同一帳號後 cookie 都改成正本 pid，排行榜與伺服器段位只有一個身分。
 * 存檔：saves 表以 slug 為鍵存一份（前端 Progress 的雲端副本），寫入時與既有份「取大」合併（src/engine/save.ts），永遠不會變少。 */
interface Canonical {
  pid: string;
  games: number;
  xp: number;
  nick: string;
}
const canonicalFor = (db: D1Database, slug: string) => db.prepare("SELECT pid, games, xp, nick FROM players WHERE uc_slug = ? AND merged_into IS NULL ORDER BY linked_at ASC, created_at ASC LIMIT 1").bind(slug).first<Canonical>();
const linkPid = (db: D1Database, pid: string, slug: string, now: number) => db.prepare("UPDATE players SET uc_slug = ?, linked_at = ? WHERE pid = ? AND uc_slug IS NULL AND merged_into IS NULL").bind(slug, now, pid).run();

async function loadSave(db: D1Database, slug: string): Promise<{ save: SaveShape; at: number } | null> {
  const r = await db.prepare("SELECT data, updated_at FROM saves WHERE slug = ?").bind(slug).first<{ data: string; updated_at: number }>();
  if (!r) return null;
  try {
    const save = normalizeSave(JSON.parse(r.data));
    return save ? { save, at: r.updated_at } : null;
  } catch {
    return null;
  }
}

/** 核驗身分，並確定這個帳號的正本 pid（沒有就把現在的 pid 連上；現在的 pid 若屬於別的帳號，就另起一個新 pid）。 */
async function bindAccount(request: Request, env: Env, db: D1Database, now: number): Promise<{ ok: true; slug: string; name: string; pid: string; headers: Record<string, string>; row: PlayerLink | null; canon: Canonical; foreign: boolean } | { ok: false; res: Response }> {
  const id = await ucIdentity(request, env.USER_CENTER_ORIGIN);
  if (id.kind === "unavailable") return { ok: false, res: json({ ok: false, reason: "uc_unavailable" }, { status: 503 }) };
  if (id.kind === "anonymous") return { ok: false, res: json({ ok: false, reason: "unauthenticated" }, { status: 401 }) };
  const { slug, name } = id.user;
  let { pid, headers, row } = await resolvePid(request, db, false);
  await ensurePlayer(db, pid, now);
  if (!row) row = await linkOf(db, pid);
  const foreign = !!row?.uc_slug && row.uc_slug !== slug;
  let canon = await canonicalFor(db, slug);
  if (!canon) {
    if (foreign) {
      pid = crypto.randomUUID();
      await ensurePlayer(db, pid, now);
      headers["set-cookie"] = pidCookie(request, pid);
      row = null;
    }
    await linkPid(db, pid, slug, now);
    canon = await canonicalFor(db, slug);
    if (!canon) return { ok: false, res: json({ ok: false, reason: "link_failed" }, { status: 500 }) };
  }
  return { ok: true, slug, name, pid, headers, row, canon, foreign };
}

/** 把某裝置的匿名戰績併入帳號正本：先把兩邊的列原樣存成快照（player_merges），再把對局改指向正本、每日最佳取高分、每週累計相加、學力與局數相加；
 * 來源 pid 標記 merged_into 並歸零（不在排行榜重複出現），之後拿著舊 cookie 來的請求都會被導回正本。 */
async function mergePlayers(db: D1Database, from: string, into: string, slug: string, now: number): Promise<boolean> {
  type PlayerRow = { pid: string; nick: string; xp: number; games: number; best: number; created_at: number; last_seen: number; mastered: number; cleared: number; rank_idx: number; uc_slug: string | null; merged_into: string | null; linked_at: number | null };
  type DailyRow = { day_key: string; score: number; run_id: string; at: number };
  type WeekRow = { week_key: string; score: number; games: number };
  const [pf, pt, df, dt, wf, wt] = await Promise.all([
    db.prepare("SELECT * FROM players WHERE pid = ?").bind(from).first<PlayerRow>(),
    db.prepare("SELECT * FROM players WHERE pid = ?").bind(into).first<PlayerRow>(),
    db.prepare("SELECT day_key, score, run_id, at FROM daily_best WHERE pid = ?").bind(from).all<DailyRow>(),
    db.prepare("SELECT day_key, score, run_id, at FROM daily_best WHERE pid = ?").bind(into).all<DailyRow>(),
    db.prepare("SELECT week_key, score, games FROM weekly_sum WHERE pid = ?").bind(from).all<WeekRow>(),
    db.prepare("SELECT week_key, score, games FROM weekly_sum WHERE pid = ?").bind(into).all<WeekRow>(),
  ]);
  if (!pf || !pt || from === into || pf.merged_into) return false;
  const dFrom = df.results || [];
  const dInto = new Map((dt.results || []).map((r) => [r.day_key, r]));
  const wFrom = wf.results || [];
  const wInto = new Map((wt.results || []).map((r) => [r.week_key, r]));
  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO player_merges (id, slug, from_pid, into_pid, at, snapshot) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), slug, from, into, now, JSON.stringify({ from: pf, into: pt, daily_from: dFrom, daily_into: [...dInto.values()], weekly_from: wFrom, weekly_into: [...wInto.values()] })),
    db.prepare("UPDATE arena_runs SET pid = ? WHERE pid = ?").bind(into, from),
  ];
  for (const r of dFrom) {
    const t = dInto.get(r.day_key);
    if (!t) stmts.push(db.prepare("UPDATE daily_best SET pid = ? WHERE pid = ? AND day_key = ?").bind(into, from, r.day_key));
    else {
      if (r.score > t.score) stmts.push(db.prepare("UPDATE daily_best SET score = ?, run_id = ?, at = ? WHERE pid = ? AND day_key = ?").bind(r.score, r.run_id, r.at, into, r.day_key));
      stmts.push(db.prepare("DELETE FROM daily_best WHERE pid = ? AND day_key = ?").bind(from, r.day_key));
    }
  }
  for (const r of wFrom) {
    if (!wInto.has(r.week_key)) stmts.push(db.prepare("UPDATE weekly_sum SET pid = ? WHERE pid = ? AND week_key = ?").bind(into, from, r.week_key));
    else {
      stmts.push(db.prepare("UPDATE weekly_sum SET score = score + ?, games = games + ? WHERE pid = ? AND week_key = ?").bind(r.score, r.games, into, r.week_key));
      stmts.push(db.prepare("DELETE FROM weekly_sum WHERE pid = ? AND week_key = ?").bind(from, r.week_key));
    }
  }
  stmts.push(
    db.prepare("UPDATE players SET xp = xp + ?, games = games + ?, best = MAX(best, ?), created_at = MIN(created_at, ?), last_seen = MAX(last_seen, ?), nick = CASE WHEN nick = '' THEN ? ELSE nick END WHERE pid = ?").bind(pf.xp, pf.games, pf.best, pf.created_at, pf.last_seen, pf.nick, into),
    db.prepare("UPDATE players SET merged_into = ?, uc_slug = NULL, xp = 0, games = 0, best = 0, mastered = 0, cleared = 0, rank_idx = 0, last_seen = ? WHERE pid = ?").bind(into, now, from),
  );
  await db.batch(stmts);
  await rankStats(db, into);
  return true;
}

/** POST /api/sync {action: link|adopt|merge}：
 * link  — 核驗登入、確定正本 pid、回雲端存檔（帳號還沒正本時把這個 pid 連上）；不改 cookie。
 * adopt — 這個裝置改用正本 pid（cookie 換掉），裝置原本的匿名戰績原樣留在原 pid。
 * merge — 先把裝置的匿名戰績併入正本，再改用正本 pid。 */
async function syncHandler(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const action = body.action === "merge" ? "merge" : body.action === "adopt" ? "adopt" : "link";
  if (!env.DB) return json({ ok: false, reason: "no_db" }, { status: 503 });
  const db = env.DB;
  const now = Date.now();
  const b = await bindAccount(request, env, db, now);
  if (!b.ok) return b.res;
  let { pid, canon } = b;
  const { slug, name, headers, foreign } = b;
  let same = canon.pid === pid;
  let pidHasRuns = false;
  let merged = false;
  if (!same && !foreign) pidHasRuns = ((await db.prepare("SELECT COUNT(*) AS n FROM arena_runs WHERE pid = ?").bind(pid).first<{ n: number }>())?.n || 0) > 0;
  if (!same && action !== "link") {
    if (action === "merge" && !foreign && pidHasRuns) merged = await mergePlayers(db, pid, canon.pid, slug, now);
    pid = canon.pid;
    headers["set-cookie"] = pidCookie(request, pid);
    same = true;
    canon = (await canonicalFor(db, slug)) || canon;
  }
  const cloud = await loadSave(db, slug);
  if (cloud) await rankStats(db, canon.pid, cloud.save); // 開站連結時就把榜上段位對齊存檔（舊玩家不必再打一局）
  return json({ ok: true, slug, name, pid, canonical: canon.pid, same, foreign, pidHasRuns: same ? false : pidHasRuns, merged, save: cloud?.save ?? null, savedAt: cloud?.at ?? null, serverXp: canon.xp, serverGames: canon.games }, { headers });
}

/** PUT /api/save {save}：登入者的雲端存檔。與既有份「取大」合併後存回；若合併後與送來的不同（別台裝置有新進度），把合併結果一併回給前端採用。 */
async function saveHandler(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return json({ ok: false, reason: "no_db" }, { status: 503 });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > SAVE_MAX_BYTES) return json({ ok: false, reason: "too_large" }, { status: 413 });
  const text = await request.text();
  if (text.length > SAVE_MAX_BYTES) return json({ ok: false, reason: "too_large" }, { status: 413 });
  let incoming: SaveShape | null = null;
  try {
    incoming = normalizeSave((JSON.parse(text) as { save?: unknown }).save);
  } catch {
    incoming = null;
  }
  if (!incoming) return json({ ok: false, reason: "bad_save" }, { status: 400 });
  const db = env.DB;
  const now = Date.now();
  const b = await bindAccount(request, env, db, now);
  if (!b.ok) return b.res;
  const existing = await loadSave(db, b.slug);
  const merged = existing ? mergeSaves(existing.save, incoming) : incoming;
  const data = serializeSave(merged);
  const bytes = utf8Bytes(data);
  if (bytes > SAVE_MAX_BYTES) return json({ ok: false, reason: "too_large" }, { status: 413 });
  await db
    .prepare("INSERT INTO saves (slug, pid, data, bytes, v, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(slug) DO UPDATE SET pid = excluded.pid, data = excluded.data, bytes = excluded.bytes, updated_at = excluded.updated_at")
    .bind(b.slug, b.canon.pid, data, bytes, now, now)
    .run();
  await rankStats(db, b.canon.pid, merged);
  const changed = data !== serializeSave(incoming);
  return json({ ok: true, savedAt: now, bytes, changed, save: changed ? merged : undefined, serverXp: b.canon.xp, same: b.pid === b.canon.pid }, { headers: b.headers });
}

const STATS_TTL = 5 * 60 * 1000;
let statsCache: { at: number; body: string } | null = null;

async function statsHandler(env: Env): Promise<Response> {
  if (!env.DB) return json({ todayRuns: 0, todayPlayers: 0, totalRuns: 0, hot: [] });
  const now = Date.now();
  if (statsCache && now - statsCache.at < STATS_TTL) return new Response(statsCache.body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
  const day = dayKeyOf(now);
  const [today, total, hot] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS runs, COUNT(DISTINCT pid) AS players FROM arena_runs WHERE day_key = ?").bind(day).first<{ runs: number; players: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM arena_runs").first<{ n: number }>(),
    env.DB.prepare("SELECT card, COUNT(*) AS n, SUM(correct) AS ok FROM arena_answers GROUP BY card HAVING n >= 20 ORDER BY (SUM(correct) * 1.0 / COUNT(*)) ASC LIMIT 8").all<{ card: string; n: number; ok: number }>(),
  ]);
  const cardWord = new Map<string, string>();
  for (const e of Object.values(INDEX.q)) if (!cardWord.has(e.c)) cardWord.set(e.c, "");
  const body = JSON.stringify({
    todayRuns: today?.runs || 0,
    todayPlayers: today?.players || 0,
    totalRuns: total?.n || 0,
    hot: (hot.results || []).map((h) => ({ card: h.card, w: cardWord.get(h.card) ?? "", accuracy: Math.round((h.ok / h.n) * 100), n: h.n })),
  });
  statsCache = { at: now, body };
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith("/api/")) {
      try {
        if (path === "/api/health") return json({ ok: true, site: env.SITE_KEY, bank: INDEX.version, db: !!env.DB });
        if (path === "/api/run" && request.method === "POST") return await submitRun(request, env);
        if (path === "/api/leaderboard" && request.method === "GET") return await leaderboard(request, env);
        if (path === "/api/me" && request.method === "GET") return await meHandler(request, env);
        if (path === "/api/nick" && request.method === "POST") return await nickHandler(request, env);
        if (path === "/api/stats" && request.method === "GET") return await statsHandler(env);
        if (path === "/api/sync" && request.method === "POST") return await syncHandler(request, env);
        if (path === "/api/save" && request.method === "PUT") return await saveHandler(request, env);
        return json({ error: "not_found" }, { status: 404 });
      } catch (err) {
        return json({ error: "server_error", detail: String((err as Error)?.message || err).slice(0, 200) }, { status: 500 });
      }
    }
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404 && request.method === "GET" && !/\.[a-z0-9]+$/i.test(path)) {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }
    return res;
  },
};

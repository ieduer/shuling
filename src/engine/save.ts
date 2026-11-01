/** 存檔的純函式層（前端與 Worker 共用，不依賴任何執行環境）：驗證、合併、序列化。
 * 合併一律「取大／取聯集」：任何一方的學力、局數、收服、星數、成就都不會因為合併而減少，所以同一份存檔反覆合併、或兩台裝置各自前進後再合併，都不會丟東西。 */

export interface SaveQStat {
  ok: number;
  bad: number;
  last: number;
  streak: number;
}
export interface SaveCardStat {
  seen: number;
  ok: number;
  bad: number;
  first: number;
  masteredAt?: number;
}
export interface SaveStage {
  stars: number;
  best: number;
  runs: number;
}
export interface SaveShape {
  v: 1;
  xp: number;
  games: number;
  best: number;
  bestCombo: number;
  totalCorrect: number;
  totalAnswered: number;
  dayStreak: number;
  lastDay: string;
  daily: Record<string, { score: number; at: number }>;
  q: Record<string, SaveQStat>;
  cards: Record<string, SaveCardStat>;
  misses: string[];
  nick: string;
  sound: boolean;
  seenIntro: boolean;
  achievements: Record<string, number>;
  stages: Record<string, SaveStage>;
  wins: number;
  losses: number;
  dayRuns: Record<string, number>;
}

/** 雲端存檔上限（序列化後位元組）：全題庫 2,730 題＋1,286 書靈的統計約 300 KB，留三倍餘裕 */
export const SAVE_MAX_BYTES = 1_000_000;
const MAX_KEYS = 20000;
const MAX_TS = 4102444800000; // 2100-01-01：之後的時間戳視為壞資料
const KEY_RE = /^[^\u0000-\u001f\u007f]{1,120}$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const int = (v: unknown, max = 1e9): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0;
};
const ts = (v: unknown): number => int(v, MAX_TS);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function table<T>(raw: unknown, f: (v: Record<string, unknown>) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObj(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (!KEY_RE.test(k) || !isObj(v)) continue;
    const x = f(v);
    if (x === null) continue;
    out[k] = x;
    if (++n >= MAX_KEYS) break;
  }
  return out;
}

export function emptySave(): SaveShape {
  return { v: 1, xp: 0, games: 0, best: 0, bestCombo: 0, totalCorrect: 0, totalAnswered: 0, dayStreak: 0, lastDay: "", daily: {}, q: {}, cards: {}, misses: [], nick: "", sound: false, seenIntro: false, achievements: {}, stages: {}, wins: 0, losses: 0, dayRuns: {} };
}

/** 把任何輸入整理成合法存檔：壞欄位個別丟掉、數值截到合理範圍、未知欄位（含本機的 owner／cloudAt）不帶。非物件回 null。 */
export function normalizeSave(raw: unknown): SaveShape | null {
  if (!isObj(raw)) return null;
  const r = raw;
  const achievements: Record<string, number> = {};
  if (isObj(r.achievements)) {
    let n = 0;
    for (const [k, v] of Object.entries(r.achievements)) {
      if (!KEY_RE.test(k)) continue;
      const t = ts(v);
      if (t <= 0) continue;
      achievements[k] = t;
      if (++n >= MAX_KEYS) break;
    }
  }
  const dayRuns: Record<string, number> = {};
  if (isObj(r.dayRuns)) {
    let n = 0;
    for (const [k, v] of Object.entries(r.dayRuns)) {
      if (!KEY_RE.test(k)) continue;
      const c = int(v, 10000);
      if (c <= 0) continue;
      dayRuns[k] = c;
      if (++n >= MAX_KEYS) break;
    }
  }
  return {
    v: 1,
    xp: int(r.xp),
    games: int(r.games),
    best: int(r.best),
    bestCombo: int(r.bestCombo),
    totalCorrect: int(r.totalCorrect),
    totalAnswered: int(r.totalAnswered),
    dayStreak: int(r.dayStreak, 100000),
    lastDay: DAY_RE.test(String(r.lastDay ?? "")) ? String(r.lastDay) : "",
    daily: table(r.daily, (v) => ({ score: int(v.score), at: ts(v.at) })),
    q: table(r.q, (v) => ({ ok: int(v.ok), bad: int(v.bad), last: ts(v.last), streak: int(v.streak) })),
    cards: table(r.cards, (v) => {
      const c: SaveCardStat = { seen: int(v.seen), ok: int(v.ok), bad: int(v.bad), first: ts(v.first) };
      const m = ts(v.masteredAt);
      if (m > 0) c.masteredAt = m;
      return c;
    }),
    misses: Array.isArray(r.misses) ? (r.misses.filter((x) => typeof x === "string" && KEY_RE.test(x)) as string[]).slice(0, 120) : [],
    nick: str(r.nick, 64).trim().slice(0, 12),
    sound: !!r.sound,
    seenIntro: !!r.seenIntro,
    achievements,
    stages: table(r.stages, (v) => ({ stars: int(v.stars, 3), best: int(v.best), runs: int(v.runs) })),
    wins: int(r.wins),
    losses: int(r.losses),
    dayRuns,
  };
}

const minPos = (a: number | undefined, b: number | undefined): number | undefined => (a && b ? Math.min(a, b) : a || b || undefined);

/** 合併兩份存檔。數值取大、表取聯集（同鍵逐欄取大）、時間戳「最早達成」取小；偏好（暱稱、音效）以 incoming（正在用的那台裝置）為準。
 * 性質：mergeSaves(a, a) = a；mergeSaves(a, b) 的每個計數都 ≥ a 與 b 的對應值；可交換（除偏好欄位）。 */
export function mergeSaves(base: SaveShape, incoming: SaveShape): SaveShape {
  const a = base;
  const b = incoming;
  const laterDay = b.lastDay > a.lastDay ? b : a.lastDay > b.lastDay ? a : null;
  const q: Record<string, SaveQStat> = { ...a.q };
  for (const [k, y] of Object.entries(b.q)) {
    const x = q[k];
    q[k] = x ? { ok: Math.max(x.ok, y.ok), bad: Math.max(x.bad, y.bad), last: Math.max(x.last, y.last), streak: y.last >= x.last ? y.streak : x.streak } : y;
  }
  const cards: Record<string, SaveCardStat> = { ...a.cards };
  for (const [k, y] of Object.entries(b.cards)) {
    const x = cards[k];
    if (!x) {
      cards[k] = y;
      continue;
    }
    const c: SaveCardStat = { seen: Math.max(x.seen, y.seen), ok: Math.max(x.ok, y.ok), bad: Math.max(x.bad, y.bad), first: minPos(x.first, y.first) || 0 };
    const m = minPos(x.masteredAt, y.masteredAt);
    if (m) c.masteredAt = m;
    cards[k] = c;
  }
  const stages: Record<string, SaveStage> = { ...a.stages };
  for (const [k, y] of Object.entries(b.stages)) {
    const x = stages[k];
    stages[k] = x ? { stars: Math.max(x.stars, y.stars), best: Math.max(x.best, y.best), runs: Math.max(x.runs, y.runs) } : y;
  }
  const daily: Record<string, { score: number; at: number }> = { ...a.daily };
  for (const [k, y] of Object.entries(b.daily)) {
    const x = daily[k];
    daily[k] = !x || y.score > x.score ? y : x;
  }
  const achievements: Record<string, number> = { ...a.achievements };
  for (const [k, y] of Object.entries(b.achievements)) achievements[k] = minPos(achievements[k], y) || y;
  const dayRuns: Record<string, number> = { ...a.dayRuns };
  for (const [k, y] of Object.entries(b.dayRuns)) dayRuns[k] = Math.max(dayRuns[k] || 0, y);
  const primary = laterDay ?? b;
  const secondary = primary === a ? b : a;
  const misses = [...primary.misses];
  for (const id of secondary.misses) if (!misses.includes(id)) misses.push(id);
  return {
    v: 1,
    xp: Math.max(a.xp, b.xp),
    games: Math.max(a.games, b.games),
    best: Math.max(a.best, b.best),
    bestCombo: Math.max(a.bestCombo, b.bestCombo),
    totalCorrect: Math.max(a.totalCorrect, b.totalCorrect),
    totalAnswered: Math.max(a.totalAnswered, b.totalAnswered),
    dayStreak: laterDay ? laterDay.dayStreak : Math.max(a.dayStreak, b.dayStreak),
    lastDay: a.lastDay > b.lastDay ? a.lastDay : b.lastDay,
    daily,
    q,
    cards,
    misses: misses.slice(0, 120),
    nick: b.nick || a.nick,
    sound: b.sound,
    seenIntro: a.seenIntro || b.seenIntro,
    achievements,
    stages,
    wins: Math.max(a.wins, b.wins),
    losses: Math.max(a.losses, b.losses),
    dayRuns,
  };
}

export function isEmptySave(s: SaveShape): boolean {
  return s.games === 0 && s.totalAnswered === 0 && s.xp === 0 && Object.keys(s.cards).length === 0 && Object.keys(s.stages).length === 0;
}

export interface SaveSummary {
  games: number;
  mastered: number;
  xp: number;
  stars: number;
}
export function saveSummary(s: SaveShape): SaveSummary {
  let mastered = 0;
  for (const c of Object.values(s.cards)) if (c.masteredAt) mastered++;
  let stars = 0;
  for (const st of Object.values(s.stages)) stars += st.stars;
  return { games: s.games, mastered, xp: s.xp, stars };
}

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]));
  return v;
}
/** 鍵排序後的 JSON：同一份存檔不論物件鍵的插入順序都得到同一字串，可直接比較「有沒有變」。 */
export function serializeSave(s: SaveShape): string {
  return JSON.stringify(stable(s));
}
export function utf8Bytes(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? (i++, 4) : 3;
  }
  return n;
}

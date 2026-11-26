/** 本機進度存檔（localStorage）＋ React 訂閱。排行榜分數以 Worker 為準；本機只記學習狀態。 */
import { useSyncExternalStore } from "react";
import type { CardMeta, Question, RunSummary } from "./types";
import { dayKey } from "./rng";
import { clearedStats, creditByQuestion, creditXp, perQuestionMode, repeatMultiplier } from "./rank";

export interface QStat {
  ok: number;
  bad: number;
  last: number; // ts
  streak: number; // consecutive correct
}
export interface CardStat {
  seen: number;
  ok: number;
  bad: number;
  first: number;
  masteredAt?: number;
}
export interface Progress {
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
  q: Record<string, QStat>;
  cards: Record<string, CardStat>;
  misses: string[]; // question ids, newest first
  nick: string;
  sound: boolean;
  seenIntro: boolean;
  achievements: Record<string, number>;
  stages: Record<string, { stars: number; best: number; runs: number }>; // 課文關卡
  wins: number;
  losses: number;
  /** 同一範圍今天已出陣幾次（鍵 `北京日|範圍`），只留當天：重複出陣的學力遞減 */
  dayRuns: Record<string, number>;
  /** 這份本機存檔屬於哪個用戶中心帳號（slug）；未登入過的裝置沒有。只在本機，不進雲端存檔。 */
  owner?: string;
  /** 最近一次與雲端存檔對齊的時間（伺服器時間） */
  cloudAt?: number;
}

const KEY = "shuling-v1";
const LEGACY_KEY = "shuling-legacy-unused"; // 書靈沒有舊版存檔

function fresh(): Progress {
  return {
    v: 1,
    xp: 0,
    games: 0,
    best: 0,
    bestCombo: 0,
    totalCorrect: 0,
    totalAnswered: 0,
    dayStreak: 0,
    lastDay: "",
    daily: {},
    q: {},
    cards: {},
    misses: [],
    nick: "",
    sound: false,
    seenIntro: false,
    achievements: {},
    stages: {},
    wins: 0,
    losses: 0,
    dayRuns: {},
  };
}

let state: Progress = load();
const listeners = new Set<() => void>();

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const out = { ...fresh(), ...parsed, v: 1 } as Progress;
    // 存檔裡的表若不是物件（舊版、手改或寫壞成 null），記憶體裡改用空表，其餘欄位原樣保留：一個欄位壞了不能讓整頁崩成純色，
    // 也不改寫既有存檔（下一次正常寫入才會落盤）。
    for (const k of ["daily", "q", "cards", "achievements", "stages", "dayRuns"] as const) {
      const v = out[k] as unknown;
      if (!v || typeof v !== "object" || Array.isArray(v)) (out as unknown as Record<string, unknown>)[k] = {};
    }
    if (!Array.isArray(out.misses)) out.misses = [];
    return out;
  } catch {
    return fresh();
  }
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: play in memory */
  }
}

function set(next: Progress): void {
  state = next;
  persist();
  for (const l of listeners) l();
}

export function getProgress(): Progress {
  return state;
}

export function useProgress(): Progress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function hasLegacySave(): boolean {
  try {
    return !!localStorage.getItem(LEGACY_KEY);
  } catch {
    return false;
  }
}

export function cardLevel(stat: CardStat | undefined): number {
  if (!stat) return 0;
  return Math.max(0, Math.min(5, stat.ok - Math.floor(stat.bad / 2)));
}

export function isMastered(stat: CardStat | undefined): boolean {
  return cardLevel(stat) >= 3;
}

export function recordAnswer(q: Question, card: CardMeta, correct: boolean): { newCard: boolean; mastered: boolean } {
  const now = Date.now();
  const qs = { ...(state.q[q.id] || { ok: 0, bad: 0, last: 0, streak: 0 }) };
  qs.last = now;
  if (correct) {
    qs.ok++;
    qs.streak++;
  } else {
    qs.bad++;
    qs.streak = 0;
  }
  const cs = { ...(state.cards[card.id] || { seen: 0, ok: 0, bad: 0, first: now }) };
  const newCard = cs.seen === 0;
  cs.seen++;
  if (correct) cs.ok++;
  else cs.bad++;
  const wasMastered = !!cs.masteredAt;
  if (!cs.masteredAt && isMastered(cs)) cs.masteredAt = now;
  let misses = state.misses.filter((id) => id !== q.id);
  if (!correct) misses = [q.id, ...misses].slice(0, 120);
  set({
    ...state,
    q: { ...state.q, [q.id]: qs },
    cards: { ...state.cards, [card.id]: cs },
    misses,
    totalCorrect: state.totalCorrect + (correct ? 1 : 0),
    totalAnswered: state.totalAnswered + 1,
  });
  return { newCard, mastered: !wasMastered && !!cs.masteredAt };
}

export function starsOf(correct: number, total: number): number {
  if (!total) return 0;
  const r = correct / total;
  return r >= 0.999 ? 3 : r >= 0.7 ? 2 : r >= 0.4 ? 1 : 0;
}

export interface FinishResult {
  xpBefore: number;
  xpAfter: number;
  /** 實際入帳的學力（重複出陣遞減後） */
  gain: number;
  multiplier: number;
  /** 本局之前，同一範圍今天已出陣幾次（闖關／今日試煉） */
  repeat: number;
  /** 出陣／復仇：本局有幾題今天已答對過（這幾題遞減，其餘全額） */
  repeatQs: number;
}

export function repeatKey(scope: string, day = dayKey()): string {
  return `${day}|${scope}`;
}

/** 這一題今天答對次數的鍵（與局數共用 dayRuns，前綴 q: 與範圍鍵分開）。 */
export function questionDayKey(q: string, day = dayKey()): string {
  return `${day}|q:${q}`;
}

export function priorRunsToday(scope: string): number {
  return state.dayRuns?.[repeatKey(scope)] || 0;
}

export function finishRun(run: RunSummary): FinishResult {
  const today = dayKey();
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  const dayStreak = state.lastDay === today ? state.dayStreak : state.lastDay === yesterday ? state.dayStreak + 1 : 1;
  const xpBefore = state.xp;
  const key = repeatKey(run.scope, today);
  // 只留今天的計數，存檔不會越積越大；鍵 `日|範圍` 記局數，`日|q:題號` 記這一題今天答對幾次
  const dayRuns: Record<string, number> = {};
  for (const [k, v] of Object.entries(state.dayRuns || {})) if (k.startsWith(today + "|")) dayRuns[k] = v;
  let repeat = 0;
  let repeatQs = 0;
  let multiplier = 1;
  let gain = run.score;
  if (perQuestionMode(run.mode)) {
    // 出陣／復仇按題遞減（2026-11-26）：題目不同就全額，同一題今天第二次答對起遞減
    const r = creditByQuestion(run.answers.map((a) => ({ q: a.q, score: a.correct ? a.score : 0 })), (q) => dayRuns[questionDayKey(q, today)] || 0);
    gain = r.credited;
    repeatQs = r.repeated;
    multiplier = run.score > 0 ? Math.round((gain / run.score) * 100) / 100 : 1;
  } else {
    repeat = dayRuns[key] || 0;
    multiplier = repeatMultiplier(repeat);
    gain = creditXp(run.score, repeat);
  }
  // 同一局裡重複出現的題只記一次（與 Worker 的 arena_answers 主鍵 (run_id, q) 一致）
  for (const q of new Set(run.answers.filter((a) => a.correct && a.score > 0).map((a) => a.q))) dayRuns[questionDayKey(q, today)] = (dayRuns[questionDayKey(q, today)] || 0) + 1;
  const xpAfter = state.xp + gain;
  dayRuns[key] = (dayRuns[key] || 0) + 1;
  const daily = { ...state.daily };
  if (run.mode === "daily") {
    // 今日榜只計首戰（再練不計排行），本機也記首戰的分數，首頁「今日 N 分」和榜上一致（2026-10-31 v2.10）
    const prev = daily[today];
    if (!prev) daily[today] = { score: run.score, at: run.finishedAt };
  }
  const stages = { ...state.stages };
  if (run.mode === "lesson") {
    const prev = stages[run.scope] || { stars: 0, best: 0, runs: 0 };
    stages[run.scope] = { stars: Math.max(prev.stars, starsOf(run.correct, run.total)), best: Math.max(prev.best, run.score), runs: prev.runs + 1 };
  }
  set({
    ...state,
    xp: xpAfter,
    games: state.games + 1,
    best: Math.max(state.best, run.score),
    bestCombo: Math.max(state.bestCombo, run.maxCombo),
    dayStreak,
    lastDay: today,
    daily,
    stages,
    wins: state.wins + (run.lost ? 0 : 1),
    losses: state.losses + (run.lost ? 1 : 0),
    dayRuns,
  });
  return { xpBefore, xpAfter, gain, multiplier, repeat, repeatQs };
}

/** 本機段位統計：收服＝已收服的書靈；通關／域＝旅程關卡的星數。 */
export function rankStatsOf(p: Progress, lessons: { id: string; books: string[]; questions: number }[], questionIds: Iterable<string> = []): { xp: number; mastered: number; cleared: number; regions: number; done: number; total: number } {
  const mastered = Object.values(p.cards || {}).filter((c) => c && c.masteredAt).length;
  const c = clearedStats((id) => p.stages?.[id]?.stars || 0, lessons);
  // 題海（文曲之上的階）：題庫裡答對過一次的題數
  let done = 0;
  let total = 0;
  for (const id of questionIds) {
    total++;
    const s = p.q?.[id];
    if (s && s.ok >= 1) done++;
  }
  return { xp: p.xp, mastered, cleared: c.cleared, regions: c.regions, done, total };
}

export function setNick(nick: string): void {
  set({ ...state, nick: nick.trim().slice(0, 12) });
}
export function setSound(on: boolean): void {
  set({ ...state, sound: on });
}
export function markIntroSeen(): void {
  set({ ...state, seenIntro: true });
}
export function unlockAchievement(id: string): boolean {
  if (state.achievements[id]) return false;
  set({ ...state, achievements: { ...state.achievements, [id]: Date.now() } });
  return true;
}
export function resetProgress(): void {
  set(fresh());
}
/** 整份換成合併後的存檔（跨裝置同步用）；壞欄位的防呆與 load() 相同。 */
export function replaceProgress(next: Progress): void {
  const out = { ...fresh(), ...next, v: 1 } as Progress;
  for (const k of ["daily", "q", "cards", "achievements", "stages", "dayRuns"] as const) {
    const v = out[k] as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) (out as unknown as Record<string, unknown>)[k] = {};
  }
  if (!Array.isArray(out.misses)) out.misses = [];
  set(out);
}
export function exportProgress(): string {
  return JSON.stringify(state, null, 1);
}

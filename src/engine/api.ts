/** Worker API：局分提交（伺服器重算）、排行榜、個人資料、登入後的雲端存檔。全部失敗容忍，遊戲不等網路。 */
import type { SaveShape } from "./save";
import type { RunMode } from "./types";

export interface SubmitPayload {
  mode: RunMode;
  seed: string;
  scope: string;
  nick: string;
  uc?: { slug?: string; name?: string } | null;
  answers: { q: string; pick: string; ms: number }[];
  startedAt: number;
}

export interface SubmitResult {
  ok: boolean;
  scored: boolean;
  score: number;
  correct: number;
  xp: number;
  ranks: { daily: number | null; weekly: number | null; all: number | null };
  reason?: string;
  duplicate?: boolean; // 同一份戰報重送時伺服器回既有結果，不再加學力
  xpGain?: number; // 實際入帳學力（同範圍同日重複出陣遞減）
  multiplier?: number;
  repeat?: number;
  rankIdx?: number; // 伺服器算的段位（收服／通關依已送達的戰報）
  mastered?: number;
  cleared?: number;
  regions?: number;
}

export interface BoardRow {
  rank: number;
  nick: string;
  score: number;
  xp: number;
  games: number;
  me: boolean;
  rankIdx?: number; // 段位（伺服器算）；舊版伺服器沒有時用學力推估
  mastered?: number;
}

export interface BoardResult {
  period: "daily" | "weekly" | "all";
  key: string;
  rows: BoardRow[];
  me: BoardRow | null;
  players: number;
}

export interface MeResult {
  pid: string;
  nick: string;
  xp: number;
  games: number;
  best: number;
  todayScored: boolean;
  rankIdx?: number;
  mastered?: number;
  cleared?: number;
  linked?: boolean; // 這個 pid 已連結用戶中心帳號
}

/** POST /api/sync（v2.5 跨裝置同步）。失敗時 ok:false 帶 reason：unauthenticated／uc_unavailable／no_db。 */
export type SyncAction = "link" | "adopt" | "merge";
export interface SyncResult {
  ok: boolean;
  reason?: string;
  slug?: string;
  name?: string;
  pid?: string;
  canonical?: string;
  same?: boolean; // 這個裝置的 pid 就是帳號正本
  foreign?: boolean; // 這個裝置的 pid 屬於別的帳號
  pidHasRuns?: boolean; // 裝置的匿名 pid 有戰績（可併入）
  merged?: boolean;
  save?: SaveShape | null;
  savedAt?: number | null;
  serverXp?: number;
  serverGames?: number;
}
export interface SaveResult {
  ok: boolean;
  reason?: string;
  savedAt?: number;
  bytes?: number;
  changed?: boolean; // 伺服器那份合併後和送上去的不同（別台裝置有新進度）
  save?: SaveShape;
  serverXp?: number;
}

export interface StatsResult {
  todayRuns: number;
  todayPlayers: number;
  totalRuns: number;
  hot: { card: string; w: string; accuracy: number; n: number }[];
}

/** 本機 vite dev 沒有 Worker（除非設 VITE_API_BASE）：所有 API 一律回 null，待送匣也不收。 */
export function apiEnabled(): boolean {
  const env = (import.meta as unknown as { env?: { DEV?: boolean; VITE_API_BASE?: string } }).env;
  return !(env?.DEV && !env?.VITE_API_BASE);
}

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!apiEnabled()) return null;
  try {
    const base = (import.meta.env.VITE_API_BASE as string | undefined) || "";
    const r = await fetch(base + path, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
    if (!r.ok) {
      // 只有帶 {ok:false, reason} 的業務拒絕（如 /api/run 400）才回給畫面；5xx 或其他錯誤體一律視為離線
      try {
        const body = (await r.json()) as { ok?: unknown };
        return body && body.ok === false ? (body as T) : null;
      } catch {
        return null;
      }
    }
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function submitRun(payload: SubmitPayload): Promise<SubmitResult | null> {
  return call<SubmitResult>("/api/run", { method: "POST", body: JSON.stringify(payload), keepalive: true });
}

export function fetchBoard(period: "daily" | "weekly" | "all"): Promise<BoardResult | null> {
  return call<BoardResult>(`/api/leaderboard?period=${period}`);
}

export function fetchMe(): Promise<MeResult | null> {
  return call<MeResult>("/api/me");
}

export function pushNick(nick: string): Promise<MeResult | null> {
  return call<MeResult>("/api/nick", { method: "POST", body: JSON.stringify({ nick }) });
}

export function fetchStats(): Promise<StatsResult | null> {
  return call<StatsResult>("/api/stats");
}

export function postSync(action: SyncAction): Promise<SyncResult | null> {
  return call<SyncResult>("/api/sync", { method: "POST", body: JSON.stringify({ action }) });
}

export function putSave(save: SaveShape): Promise<SaveResult | null> {
  return call<SaveResult>("/api/save", { method: "PUT", body: JSON.stringify({ save }) });
}

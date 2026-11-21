/** 六靈總榜（2026-11-20，sixling-total-20261120；2026-11-21 加入未登入玩家，sixling-anon-20261121）：字靈、書靈、詞靈、句靈、靈山、理靈六站段位相加，
 * 由靈山 Worker 的 /api/total 彙總。六站共用同一份客戶端，只有 HERE（本站）與 TOTAL_URL 不同；靈山同源讀，其他五站跨站讀 ling.bdfz.net
 * （帶 cookie 才認得出登入的「我」）。沒登入的人另送 meKey＝SHA-256("sixling-me:" + 本站 pid) 前 24 個十六進位字元（不可反推 pid），讓總榜找出自己那一列。 */
import { apiEnabled, fetchMe } from "./api";

export const HERE = "shuling";
const TOTAL_URL = ((import.meta as unknown as { env?: { VITE_TOTAL_URL?: string } }).env?.VITE_TOTAL_URL) || "https://ling.bdfz.net/api/total";

export interface TotalSite {
  key: string;
  name: string;
  title: string;
  url: string;
  /** 該站段位徽章與標誌的目錄（各站自己的真圖） */
  art: string;
  ranks: string[];
  ok: boolean;
  players: number;
  accounts: number;
}
export interface TotalRow {
  rank: number;
  nick: string;
  score: number;
  games: number;
  /** 依 sites 順序：[段位索引, 本站分數] 或 null（沒玩過） */
  t: ([number, number] | null)[];
  /** 沒登入的玩家：只計所在那一站 */
  anon?: boolean;
  me: boolean;
}
export interface TotalResult {
  v: 1;
  formula: string;
  perTier: number;
  at: number;
  partial: boolean;
  sites: TotalSite[];
  rows: TotalRow[];
  me: TotalRow | null;
  meBy?: "account" | "device" | null;
  viewer: "user" | "anonymous" | "unavailable";
  /** 上榜列數（登入帳號＋未登入玩家） */
  entries?: number;
  /** 登入帳號數（六站合計成一列） */
  accounts: number;
  /** 未登入玩家列數（各計一站） */
  anonymous?: number;
  players: number;
}

/** 本站 pid 的加鹽雜湊（與 Worker meKeyOf 同一算法）；拿不到就不送 */
export async function meKey(): Promise<string | null> {
  try {
    const me = await fetchMe();
    if (!me?.pid || typeof crypto === "undefined" || !crypto.subtle) return null;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("sixling-me:" + me.pid));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
  } catch {
    return null;
  }
}

export async function fetchTotal(): Promise<TotalResult | null> {
  if (!apiEnabled()) return null;
  try {
    const key = await meKey();
    const url = key ? TOTAL_URL + (TOTAL_URL.includes("?") ? "&" : "?") + "me=" + key : TOTAL_URL;
    const r = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as TotalResult;
    return j && j.v === 1 && Array.isArray(j.rows) && Array.isArray(j.sites) ? j : null;
  } catch {
    return null;
  }
}

/** 一列在哪一站分數最高（頒獎台上的大徽章用那一站的） */
export function bestSite(row: TotalRow): number {
  let best = -1;
  row.t.forEach((x, i) => {
    if (x && (best < 0 || x[1] > (row.t[best] as [number, number])[1])) best = i;
  });
  return best;
}

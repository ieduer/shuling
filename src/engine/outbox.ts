/** 戰報待送匣（2026-10-31）：/api/run 送不出去（離線、5xx、分頁被關）時先存本機，開站、回線、下一局後補送。
 * 伺服器以（玩家、模式、範圍、種子、起始時刻）去重，補送同一份戰報不會多算學力；補送成功才從匣裡拿掉。
 * 線上核查：一位玩家本機 481 局、伺服器 479 局——促织與归园田居兩局三星在本機有、伺服器沒有，通關數因此少 2。 */
import { apiEnabled, submitRun, type SubmitPayload, type SubmitResult } from "./api.ts";

export interface OutboxEntry {
  at: number;
  payload: SubmitPayload;
}
export interface OutboxStore {
  get(): OutboxEntry[];
  set(entries: OutboxEntry[]): void;
}
export interface OutboxDeps {
  submit: (p: SubmitPayload) => Promise<SubmitResult | null>;
  store: OutboxStore;
  now?: () => number;
}

const KEY = "wy-arena-outbox";
export const OUTBOX_MAX = 60;
export const OUTBOX_TTL_MS = 14 * 86400000;

const localStore: OutboxStore = {
  get() {
    try {
      const raw = localStorage.getItem(KEY);
      const v = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(v) ? (v.filter((e) => e && typeof e === "object" && (e as OutboxEntry).payload) as OutboxEntry[]) : [];
    } catch {
      return [];
    }
  },
  set(entries) {
    try {
      if (entries.length) localStorage.setItem(KEY, JSON.stringify(entries));
      else localStorage.removeItem(KEY);
    } catch {
      /* 存不下就算了：下一局會再試 */
    }
  },
};

const defaults: OutboxDeps = { submit: submitRun, store: localStore };

/** 送一份戰報；送不到（回 null＝網路／5xx）就留在待送匣。業務拒絕（ok:false）不留。 */
export async function submitWithOutbox(payload: SubmitPayload, deps: Partial<OutboxDeps> = {}): Promise<SubmitResult | null> {
  const d = { ...defaults, ...deps };
  const r = await d.submit(payload);
  if (r === null && apiEnabled()) enqueue(payload, d);
  return r;
}

export function enqueue(payload: SubmitPayload, deps: Partial<OutboxDeps> = {}): void {
  const d = { ...defaults, ...deps };
  const now = (d.now || Date.now)();
  const key = (p: SubmitPayload) => `${p.mode}|${p.scope}|${p.seed}|${p.startedAt}`;
  const entries = d.store.get().filter((e) => now - e.at < OUTBOX_TTL_MS);
  // 同一份戰報已在匣裡：留原位（最舊的先送），不重複排隊
  if (entries.some((e) => key(e.payload) === key(payload))) {
    d.store.set(entries.slice(-OUTBOX_MAX));
    return;
  }
  d.store.set([...entries, { at: now, payload }].slice(-OUTBOX_MAX));
}

let flushing: Promise<number> | null = null;

/** 依序補送（最舊的先）；一遇到送不到就停，其餘留著。回補送成功的份數。 */
export function flushOutbox(deps: Partial<OutboxDeps> = {}): Promise<number> {
  if (flushing) return flushing;
  const d = { ...defaults, ...deps };
  flushing = (async () => {
    const now = (d.now || Date.now)();
    let entries = d.store.get().filter((e) => now - e.at < OUTBOX_TTL_MS);
    let sent = 0;
    while (entries.length) {
      const r = await d.submit(entries[0].payload);
      if (r === null) break;
      entries = entries.slice(1);
      sent++;
      d.store.set(entries);
    }
    d.store.set(entries);
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export function outboxSize(deps: Partial<OutboxDeps> = {}): number {
  return (deps.store || localStore).get().length;
}

/** 開站與回線時補送。 */
export function startOutbox(): void {
  if (typeof window === "undefined" || !apiEnabled()) return;
  void flushOutbox();
  window.addEventListener("online", () => void flushOutbox());
}

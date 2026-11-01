/** 登入用戶中心後的跨裝置同步（v2.5）。
 * 伺服器以帳號（UC slug）為鍵存一份存檔；開站時拉下來與本機「取大」合併，每局後推回去。本機存檔永遠不會被雲端覆蓋成更少：
 * 合併只取聯集／取大（src/engine/save.ts），換帳號時原本那份原樣收進本機備份（localStorage `wy-arena-v1:<帳號>`），從不刪。 */
import { useSyncExternalStore } from "react";
import { toast } from "../components/Toast";
import { postSync, putSave, type SyncResult } from "../engine/api";
import { getProgress, replaceProgress, type Progress } from "../engine/progress";
import { emptySave, isEmptySave, mergeSaves, normalizeSave, saveSummary, type SaveShape, type SaveSummary } from "../engine/save";
import { displayName, getSession } from "./identity";

export type SyncStatus = "idle" | "unauth" | "syncing" | "synced" | "conflict" | "offline" | "error";
export interface SyncConflict {
  local: SaveSummary;
  cloud: SaveSummary;
}
export interface SyncState {
  status: SyncStatus;
  slug?: string;
  name?: string;
  at?: number;
  dirty: boolean;
  conflict?: SyncConflict;
  reason?: string;
}

let state: SyncState = { status: "idle", dirty: false };
const listeners = new Set<() => void>();
function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
export function useSync(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
export function getSyncState(): SyncState {
  return state;
}

const STASH = "shuling-v1:";
export function toSave(p: Progress): SaveShape {
  return normalizeSave(p) ?? emptySave();
}
function readStash(key: string): SaveShape | null {
  try {
    const raw = localStorage.getItem(STASH + key);
    return raw ? normalizeSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function writeStash(key: string, p: Progress): void {
  try {
    const cur = toSave(p);
    const prev = readStash(key);
    localStorage.setItem(STASH + key, JSON.stringify(prev ? mergeSaves(prev, cur) : cur));
  } catch {
    /* 存不下就只留記憶體裡這份 */
  }
}
function dropStash(key: string): void {
  try {
    localStorage.removeItem(STASH + key);
  } catch {
    /* ignore */
  }
}

/** 套用合併後的存檔：帳號、對齊時間一起記；學力不低於伺服器正本的學力；音效等裝置偏好留本機的。 */
function apply(save: SaveShape, slug: string, serverXp?: number, at?: number | null): void {
  const p = getProgress();
  replaceProgress({ ...p, ...save, xp: Math.max(save.xp, serverXp || 0), sound: p.sound, seenIntro: p.seenIntro || save.seenIntro, owner: slug, cloudAt: at ?? p.cloudAt });
}

let pending: { slug: string; cloud: SaveShape; serverXp?: number; savedAt?: number | null; restored: SaveShape | null } | null = null;
let started = false;
let busy: Promise<void> | null = null;

export function startSync(): void {
  if (started) return;
  started = true;
  void runSync();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (state.dirty) void push(true);
      return;
    }
    if (state.status === "synced" && Date.now() - (state.at || 0) > 10 * 60 * 1000) void runSync();
  });
}

export function runSync(): Promise<void> {
  if (busy) return busy;
  busy = doSync()
    .catch(() => setState({ status: "error", reason: "exception" }))
    .finally(() => {
      busy = null;
    });
  return busy;
}

async function doSync(): Promise<void> {
  if (state.status === "conflict") return;
  const session = await getSession();
  const slug = session.authenticated ? String(session.user?.slug || "").toLowerCase() : "";
  if (!slug) {
    setState({ status: "unauth", conflict: undefined });
    return;
  }
  setState({ status: "syncing", slug, name: displayName(session.user) });
  const r = await postSync("link");
  if (!r || !r.ok) {
    setState({ status: r?.reason === "unauthenticated" ? "unauth" : "offline", reason: r?.reason || "network" });
    return;
  }
  await reconcile(r, slug);
}

async function reconcile(r: SyncResult, slug: string): Promise<void> {
  const p = getProgress();
  const cloud = r.save ? normalizeSave(r.save) : null;
  // 1. 本機存檔屬於別的帳號（共用電腦）：原樣收進那個帳號的備份，這個帳號改用自己的雲端存檔（若之前在這台留過備份，一併合回）
  if (p.owner && p.owner !== slug) {
    writeStash(p.owner, p);
    const restored = readStash(slug);
    const next = cloud && restored ? mergeSaves(cloud, restored) : (cloud ?? restored ?? emptySave());
    if (!r.same) await postSync("adopt");
    apply(next, slug, r.serverXp, r.savedAt);
    const ok = await push(true);
    if (ok && restored) dropStash(slug);
    toast(`已改用 ${state.name || slug} 的進度`);
    return;
  }
  const restored = p.owner === slug ? null : readStash(slug);
  const local = restored ? mergeSaves(restored, toSave(p)) : toSave(p);
  // 2. 這台裝置本來就是這個帳號的、帳號第一次連結、雲端還沒有存檔、或本機根本沒進度：直接合併，不問
  if (p.owner === slug || r.same || !cloud || isEmptySave(local)) {
    let serverXp = r.serverXp;
    if (!r.same) {
      const a = await postSync(p.owner === slug && r.pidHasRuns ? "merge" : "adopt");
      if (a?.ok) serverXp = a.serverXp ?? serverXp;
    }
    const merged = cloud ? mergeSaves(cloud, local) : local;
    apply(merged, slug, serverXp, r.savedAt);
    const ok = await push(true);
    if (ok && restored) dropStash(slug);
    if (cloud && cloud.games > toSave(p).games) toast("已從用戶中心取回進度", "gold");
    return;
  }
  // 3. 本機有一份未登入的進度，帳號在別的裝置也有進度：問一次（見 SyncPrompt）
  pending = { slug, cloud, serverXp: r.serverXp, savedAt: r.savedAt, restored };
  setState({ status: "conflict", conflict: { local: saveSummary(local), cloud: saveSummary(cloud) } });
}

/** 使用者對「本機未登入進度 vs 帳號進度」的決定：併入（取聯集）或只用帳號進度（本機那份收進 `wy-arena-v1:anon` 備份）。 */
export async function resolveConflict(choice: "merge" | "adopt"): Promise<void> {
  const c = pending;
  if (!c) return;
  pending = null;
  const p = getProgress();
  setState({ status: "syncing", conflict: undefined });
  try {
    if (choice === "merge") {
      const local = c.restored ? mergeSaves(c.restored, toSave(p)) : toSave(p);
      const a = await postSync("merge");
      apply(mergeSaves(c.cloud, local), c.slug, a?.serverXp ?? c.serverXp, c.savedAt);
    } else {
      writeStash("anon", p);
      await postSync("adopt");
      apply(c.cloud, c.slug, c.serverXp, c.savedAt);
    }
    const ok = await push(true);
    if (ok && c.restored) dropStash(c.slug);
    toast(choice === "merge" ? "已併入帳號，兩邊的進度都在" : "已改用帳號進度；本機那份留在備份裡", "gold");
  } catch {
    setState({ status: "error", reason: "exception" });
  }
}

let timer: number | null = null;
let pushing: Promise<boolean> | null = null;

/** 本機存檔有變（一局結束、改暱稱…）：延遲幾秒再推，避免連續寫入。 */
export function markDirty(): void {
  if (!getProgress().owner) return;
  setState({ dirty: true });
  if (timer === null) {
    timer = window.setTimeout(() => {
      timer = null;
      void push(false);
    }, 2500);
  }
}

export function push(force: boolean): Promise<boolean> {
  if (pushing) return pushing;
  const p = getProgress();
  if (!p.owner || state.status === "unauth" || state.status === "conflict") return Promise.resolve(false);
  if (!force && !state.dirty) return Promise.resolve(true);
  if (document.documentElement.dataset.screen === "battle") {
    // 對陣中每題都在改存檔：等結算後再推
    if (!force) markDirty();
    return Promise.resolve(false);
  }
  pushing = (async () => {
    setState({ status: "syncing" });
    const owner = p.owner as string;
    const r = await putSave(toSave(p));
    if (!r || !r.ok) {
      setState({ status: r?.reason === "unauthenticated" ? "unauth" : "offline", reason: r?.reason || "network", dirty: true });
      return false;
    }
    const cur = getProgress();
    if (r.changed && r.save) {
      // 伺服器那份合併後比送上去的多（別台裝置有新進度）：採用合併結果，再與這段期間的本機變化合一次
      const merged = normalizeSave(r.save);
      if (merged) apply(mergeSaves(merged, toSave(cur)), cur.owner || owner, r.serverXp, r.savedAt);
    } else {
      replaceProgress({ ...cur, cloudAt: r.savedAt ?? cur.cloudAt });
    }
    setState({ status: "synced", dirty: false, at: r.savedAt || Date.now(), reason: undefined });
    return true;
  })().finally(() => {
    pushing = null;
  });
  return pushing;
}

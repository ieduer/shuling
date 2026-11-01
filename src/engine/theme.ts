/** 色系：四套（兩淺兩深）依序循環；點一下換下一套，不開選單。每套的文字對底色都經對比度閘門（tests/theme.test.mjs）。 */
import { useSyncExternalStore } from "react";

export type ThemeId = "paper" | "celadon" | "ink" | "indigo";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  dark: boolean;
  /** 瀏覽器工具列顏色＝頁面底色 */
  color: string;
}

/** 循環順序：宣紙 → 青瓷 → 墨夜 → 玄青 → 宣紙 */
export const THEMES: ThemeMeta[] = [
  { id: "paper", name: "宣紙", dark: false, color: "#f4ead6" },
  { id: "celadon", name: "青瓷", dark: false, color: "#e6efe9" },
  { id: "ink", name: "墨夜", dark: true, color: "#171310" },
  { id: "indigo", name: "玄青", dark: true, color: "#121a26" },
];

const KEY = "wy-theme";
const DEFAULT: ThemeId = "paper";
const listeners = new Set<() => void>();

function isTheme(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

function read(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let current: ThemeId = typeof document !== "undefined" && isTheme(document.documentElement.dataset.theme) ? (document.documentElement.dataset.theme as ThemeId) : read();

export function getTheme(): ThemeId {
  return current;
}

export function themeMeta(id: ThemeId = current): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function applyTheme(id: ThemeId): void {
  const meta = themeMeta(id);
  const root = document.documentElement;
  root.dataset.theme = meta.id;
  root.style.colorScheme = meta.dark ? "dark" : "light";
  const tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (tag) tag.content = meta.color;
}

export function setTheme(id: ThemeId): void {
  if (!isTheme(id) || id === current) return;
  current = id;
  applyTheme(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* 無法保存也不影響本次 */
  }
  listeners.forEach((fn) => fn());
}

export function nextTheme(id: ThemeId = current): ThemeId {
  const i = THEMES.findIndex((t) => t.id === id);
  return THEMES[(i + 1) % THEMES.length].id;
}

/** 點一下＝換下一套，回傳新色系的名稱（給提示用）。 */
export function cycleTheme(): ThemeMeta {
  const id = nextTheme();
  setTheme(id);
  return themeMeta(id);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}

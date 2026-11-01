/** 旅程：七冊融成一張連續地圖（七域），每課一關；關卡沿各域的蜿蜒路徑分佈，位置由課文 id 固定決定。 */
import { bank } from "./bank";
import { REGIONS, type Region } from "./art";
import type { Progress } from "./progress";
import type { Lesson } from "./types";
import { hashString } from "./rng";
import { stagesOfBook } from "./rank";

export interface StagePos {
  /** x 是域圖寬度的百分比；y 是域圖內的像素（列距固定，不會被域名牌擋住） */
  x: number;
  y: number;
}

export interface RegionStages {
  region: Region;
  stages: Lesson[];
  pos: StagePos[];
  /** 需要的列數與域圖高度（px） */
  rows: number;
  height: number;
}

export const COLS = 3;
export const ROW_H = 82;
/** 第一域的名牌貼頂，其餘域與前一域重疊 70px、名牌在 78px 處，所以第一排關卡要再往下 */
// 2026-10-31 站長：名牌遮到各域最上一排關卡圖標 → 首排下移 62px，且首排不再向上抖動：名牌底緣約 98px／162px，首排圖標頂緣 ≥ 154／218，連「你在這裡」標誌（圖標上方約 31px）也不碰名牌
export const TOP_FIRST = 180;
export const TOP_REST = 244;
export const BOTTOM_PAD = 96;
const X = [22, 50, 78];

export function stagesOf(book: string): Lesson[] {
  return stagesOfBook(bank.lessons, book) as Lesson[];
}

/** 一域的關卡＝該域所有冊別的關卡（同課只算一次，依第一次出現的冊別排序）。 */
export function stagesOfRegion(region: Region): Lesson[] {
  const seen = new Set<string>();
  const out: Lesson[] = [];
  for (const book of region.books) for (const l of stagesOf(book)) if (!seen.has(l.id)) { seen.add(l.id); out.push(l); }
  return out;
}

/** 域圖高度（px）：固定列距，上留名牌、下留與下一域的重疊帶。 */
export function regionHeight(rows: number, first: boolean): number {
  return (first ? TOP_FIRST : TOP_REST) + Math.max(0, rows - 1) * ROW_H + BOTTOM_PAD;
}

/** 蛇形路徑＋依 id 的固定抖動，看起來像散落在地圖上，但同一課永遠在同一處。 */
export function layoutStages(stages: Lesson[], first = false): { pos: StagePos[]; rows: number; height: number } {
  const rows = Math.max(1, Math.ceil(stages.length / COLS));
  const top = first ? TOP_FIRST : TOP_REST;
  const pos = stages.map((l, k) => {
    const row = Math.floor(k / COLS);
    const col = k % COLS;
    const h = hashString(`pos|${l.id}`);
    const jx = ((h & 0xff) / 255 - 0.5) * 12; // ±6%
    const jy0 = (((h >> 8) & 0xff) / 255 - 0.5) * 18; // ±9px
    const jy = row === 0 ? Math.abs(jy0) : jy0; // 首排只往下抖，不碰名牌
    const base = row % 2 === 0 ? X[col] : X[COLS - 1 - col];
    return { x: Math.max(12, Math.min(88, base + jx)), y: Math.round(top + row * ROW_H + jy) };
  });
  return { pos, rows, height: regionHeight(rows, first) };
}

export function journeyRegions(): RegionStages[] {
  const out: RegionStages[] = [];
  for (const region of REGIONS) {
    const stages = stagesOfRegion(region);
    if (!stages.length) continue;
    const { pos, rows, height } = layoutStages(stages, out.length === 0);
    out.push({ region, stages, pos, rows, height });
  }
  return out;
}

export function journeySummary(stages: Lesson[], p: Progress): { cleared: number; stars: number; total: number } {
  let cleared = 0;
  let stars = 0;
  for (const l of stages) {
    const s = p.stages[l.id]?.stars || 0;
    stars += s;
    if (s === 3) cleared++;
  }
  return { cleared, stars, total: stages.length };
}

/** 下一關 = 第一個還沒三星的關卡；全通則停在最後一關。 */
export function nextStageIndex(stages: Lesson[], p: Progress): number {
  const i = stages.findIndex((l) => (p.stages[l.id]?.stars || 0) < 3);
  return i < 0 ? Math.max(0, stages.length - 1) : i;
}

/** 整張地圖上的「你在這裡」：第一個還有關卡未三星的域；全通則最後一域。 */
export function currentRegion(regions: RegionStages[], p: Progress): { r: number; k: number } {
  for (let r = 0; r < regions.length; r++) {
    const k = regions[r].stages.findIndex((l) => (p.stages[l.id]?.stars || 0) < 3);
    if (k >= 0) return { r, k };
  }
  const last = Math.max(0, regions.length - 1);
  return { r: last, k: Math.max(0, (regions[last]?.stages.length || 1) - 1) };
}

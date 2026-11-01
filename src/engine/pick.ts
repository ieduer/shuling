/** 抽題的純函數（不碰題庫模組，方便在 node 測試）。 */
import { STAGE_MIN_QUESTIONS } from "./rank.ts";

/** 關卡一局至少要有 min 題（課文題數不足 min 時全出）：同一隻書靈的題可以在同一局重複出現。
 * 2026-10-31 修：钱塘湖春行、十五从军征與幾張真題卷只有兩隻書靈，單局原本只出 2 題——本機 2/2 給三星，
 * 伺服器只把「≥3 題且全對」的一局算通關，排行榜段位因此少算通關數。 */
export function fillToMinimum<T>(picked: T[], all: T[], order: (rest: T[]) => T[], min = STAGE_MIN_QUESTIONS, size = Number.POSITIVE_INFINITY): T[] {
  const need = Math.min(size, all.length, Math.max(min, picked.length));
  if (picked.length >= need) return picked.slice();
  const out = picked.slice();
  for (const q of order(all.filter((x) => !out.includes(x)))) {
    if (out.length >= need) break;
    out.push(q);
  }
  return out;
}

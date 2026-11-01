/** 雲端存檔算出來的段位四項（2026-10-31）：與裝置上 progress.rankStatsOf 同一規則——收服看 masteredAt（或淨答對 ≥3）、
 * 通關／全通域看關卡星數、學力看存檔。排行榜段位取「伺服器戰報算的」與「存檔算的」之大者：
 * 玩家在裝置上看到的段位（本機先記、雲端取大合併）與榜上一致；戰報沒送到、退出的局、同書靈湊題的兩題關卡都不再讓榜上少算。 */
import { clearedStats, type LessonLite, type RankStats } from "./rank.ts";
import type { SaveShape } from "./save.ts";

export function saveRankStats(s: SaveShape, lessons: LessonLite[], questionIds?: Set<string>): RankStats {
  let mastered = 0;
  for (const c of Object.values(s.cards)) if (c.masteredAt || c.ok - Math.floor(c.bad / 2) >= 3) mastered++;
  const c = clearedStats((id) => s.stages[id]?.stars || 0, lessons);
  // 題海：存檔逐題紀錄裡答對過一次、且仍在題庫裡的題
  let done = 0;
  if (questionIds) for (const [id, q] of Object.entries(s.q)) if (q.ok >= 1 && questionIds.has(id)) done++;
  return { xp: s.xp, mastered, cleared: c.cleared, regions: c.regions, done, total: questionIds ? questionIds.size : 0 };
}

/** 把每局結果寫回用戶中心（學習記錄最優先）。未登入則靜默略過。
 * 書靈在用戶中心是記錄模式（與 fuzi 相同）：只寫一筆進度快照，不寫逐局事件、不報精通，不進 A+ 計分。 */
import { getSession, SITE_KEY, syncProgress } from "./identity";
import { rankOf, type RankStats } from "../engine/score";
import type { RunSummary } from "../engine/types";
import { getProgress } from "../engine/progress";

export async function syncRunToUserCenter(run: RunSummary, stats: RankStats): Promise<void> {
  const xpAfter = stats.xp;
  try {
    const session = await getSession();
    if (!session.authenticated) return;
    const p = getProgress();
    const rank = rankOf(stats);
    const mastered = Object.values(p.cards || {}).filter((c) => c && c.masteredAt).length;
    await syncProgress({
      siteKey: SITE_KEY,
      itemKey: "shuling-total",
      itemTitle: "書靈 · 書靈精通",
      itemGroup: "書靈",
      itemType: "knowledge-battle",
      state: "in_progress",
      completed: false,
      score: xpAfter,
      progressPercent: Math.min(100, Math.round((mastered / 300) * 100)),
      meta: { xp: xpAfter, rank: rank.name, games: p.games, mastered, cleared: stats.cleared, regions: stats.regions, dayStreak: p.dayStreak },
    });
  } catch {
    /* 學習記錄同步失敗不影響遊戲 */
  }
}

export async function userCenterName(): Promise<{ slug?: string; name?: string } | null> {
  try {
    const s = await getSession();
    if (!s.authenticated || !s.user) return null;
    return { slug: s.user.slug, name: s.user.display_name || s.user.displayName || s.user.slug };
  } catch {
    return null;
  }
}

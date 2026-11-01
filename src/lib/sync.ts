/** 把每局結果寫回用戶中心（學習記錄最優先）。未登入則靜默略過。 */
import { getSession, recordEvent, SITE_KEY, syncProgress } from "./identity";
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
      itemKey: "wy-arena-total",
      itemTitle: "書靈 · 書靈精通",
      itemGroup: "書靈",
      itemType: "word-battle",
      state: "in_progress",
      completed: false,
      score: xpAfter,
      progressPercent: Math.min(100, Math.round((mastered / 300) * 100)),
      meta: { xp: xpAfter, rank: rank.name, games: p.games, mastered, cleared: stats.cleared, regions: stats.regions, dayStreak: p.dayStreak },
    });
    await recordEvent({
      siteKey: SITE_KEY,
      kind: "event",
      recordKey: `run-${run.finishedAt}`,
      title: `書靈 ${run.mode === "daily" ? "今日挑戰" : run.mode === "wrong" ? "攻錯" : "對陣"} ${run.score} 分`,
      summary: `${run.correct}/${run.total} 答對，最高連擊 ${run.maxCombo}，範圍 ${run.scope}`,
      itemGroup: "書靈",
      itemType: "word-battle",
      payload: { mode: run.mode, scope: run.scope, score: run.score, correct: run.correct, total: run.total, maxCombo: run.maxCombo, cards: run.newCards },
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

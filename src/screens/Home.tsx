import { useEffect, useMemo, useState } from "react";
import type { RunRequest } from "../App";
import { Logo } from "../components/Logo";
import type { Tab } from "../components/Nav";
import { RankBadge } from "../components/RankBadge";
import { ThemeDial } from "../components/ThemePicker";
import { fetchStats, type StatsResult } from "../engine/api";
import { art, beastById, beastFor, warm } from "../engine/art";
import { allQuestionIds, bank, cardById, prefetchChunks } from "../engine/bank";
import { glyphPx } from "../engine/glyph";
import { currentRegion, journeyRegions, journeySummary } from "../engine/journey";
import { planDaily } from "../engine/planner";
import { rankStatsOf } from "../engine/progress";
import type { Progress } from "../engine/progress";
import { rankOf } from "../engine/score";
import { dayKey } from "../engine/rng";

export function Home({ onStart, onNav, progress }: { onStart: (r: RunRequest) => void; onNav: (t: Tab) => void; progress: Progress }) {
  const today = dayKey();
  const dailyDone = progress.daily[today];
  const [stats, setStats] = useState<StatsResult | null>(null);
  const regions = useMemo(() => journeyRegions(), []);
  const cur = currentRegion(regions, progress);
  const rg = regions[cur.r];
  const next = rg?.stages[cur.k];
  const sum = rg ? journeySummary(rg.stages, progress) : { cleared: 0, stars: 0, total: 0 };
  const guardian = rg ? beastById(rg.region.guardian) : undefined;

  useEffect(() => {
    fetchStats()
      .then((r) => setStats(r && Array.isArray(r.hot) ? r : null))
      .catch(() => undefined);
    const chunks = new Set<string>();
    for (const id of planDaily(today)) {
      const qi = bank.qi.find((x) => x[0] === id);
      if (qi) chunks.add(qi[3]);
    }
    prefetchChunks([...chunks, ...(rg ? rg.region.books : [])]);
    warm([art.bg.battle, ...(rg ? [rg.region.map] : [])]);
  }, [today, rg]);

  const mastered = useMemo(() => Object.values(progress.cards || {}).filter((c) => c && c.masteredAt).length, [progress.cards]);
  const rankStats = useMemo(() => rankStatsOf(progress, bank.lessons, allQuestionIds()), [progress]);
  const rank = useMemo(() => rankOf(rankStats), [rankStats]); // 學力＝對局入帳＋成就加成（v2.10）
  const seen = Object.keys(progress.cards).length;

  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">
          <Logo size={50} />
          <h1 className="brand-title">書靈</h1>
          <ThemeDial size={46} />
        </div>
        <section className="rank-card panel-glass">
          <RankBadge stats={rankStats} size="md" showBar />
        </section>
        <ul className="home-stats">
          <li>
            <b>{rank.prestige}</b>
            <span>學力</span>
          </li>
          <li>
            <b>{mastered}</b>
            <span>收服</span>
          </li>
          <li>
            <b>{seen}</b>
            <span>圖鑑</span>
          </li>
          <li className={progress.dayStreak >= 2 ? "is-hot" : ""}>
            <b>
              {progress.dayStreak}
              {progress.dayStreak >= 2 && <img src={art.candle} alt="" aria-hidden="true" decoding="async" />}
            </b>
            <span>連日</span>
          </li>
        </ul>
      </header>

      <section className="mode-grid">
        <button type="button" className={`mode mode-daily${dailyDone ? " is-done" : ""}`} onClick={() => onStart({ mode: "daily", scope: "daily", label: "今日試煉", seed: today })}>
          <img className="mode-art" src={art.mode.daily} alt="" decoding="async" />
          <span className="mode-body">
            <span className="mode-title">今日試煉</span>
            <span className="mode-sub">{dailyDone ? (dailyDone.score > 0 ? `今日 ${dailyDone.score} 分 · 可再練` : "今日已戰 · 可再練") : "全站同題 · 計入排行"}</span>
            {stats && stats.todayPlayers > 0 && <span className="mode-people">今日 {stats.todayPlayers} 人出陣</span>}
          </span>
        </button>
        <button type="button" className="mode mode-free" onClick={() => onStart({ mode: "free", scope: "all", label: "探險", seed: `${Date.now()}` })}>
          <img className="mode-art" src={art.mode.free} alt="" decoding="async" />
          <span className="mode-body">
            <span className="mode-title">出陣</span>
            <span className="mode-sub">自由探險 · 可用神思</span>
          </span>
        </button>
        <button type="button" className={`mode mode-wrong${progress.misses.length ? "" : " is-empty"}`} onClick={() => onStart({ mode: "wrong", scope: "wrong", label: "復仇", seed: `${Date.now()}` })} disabled={!progress.misses.length}>
          <img className="mode-art" src={art.mode.wrong} alt="" decoding="async" />
          <span className="mode-body">
            <span className="mode-title">復仇</span>
            <span className="mode-sub">{progress.misses.length ? `${progress.misses.length} 隻書靈等你` : "尚無敗績"}</span>
          </span>
        </button>
      </section>

      {next && rg && (
        <section className="journey-card panel-glass" style={{ "--accent": rg.region.accent } as React.CSSProperties}>
          {guardian && <img className="jc-guardian" src={guardian.src} alt="" decoding="async" />}
          <div className="jc-main">
            <div className="jc-head">
              <h2>
                {rg.region.name}
                <small>{rg.region.sub}</small>
              </h2>
              <button type="button" className="link" onClick={() => onNav("journey")}>
                全圖
              </button>
            </div>
            <div className="jc-bar" role="progressbar" aria-valuenow={sum.cleared} aria-valuemin={0} aria-valuemax={sum.total}>
              <i style={{ width: `${sum.total ? (sum.cleared / sum.total) * 100 : 0}%` }} />
            </div>
            <div className="jc-row">
              <span className="jc-sum">
                通關 <b>{sum.cleared}</b>/{sum.total} · <img src={art.star} alt="星" className="jc-star" /> <b>{sum.stars}</b>/{sum.total * 3}
              </span>
              <button type="button" className="btn btn-primary jc-go" onClick={() => onStart({ mode: "lesson", scope: next.id, label: `${rg.region.name} 第 ${cur.k + 1} 關 《${next.title}》`, seed: `${Date.now()}` })}>
                第 {cur.k + 1} 關 出陣
              </button>
            </div>
          </div>
        </section>
      )}

      {stats && stats.hot.length > 0 && (
        <section className="hot panel-glass">
          <h2>全站最兇書靈</h2>
          <ul className="hot-list">
            {stats.hot.slice(0, 6).map((h) => {
              const c = cardById.get(h.card);
              const beast = c ? beastFor(c) : undefined;
              return (
                <li key={h.card} className={c ? `tier-${c.tier}` : ""}>
                  {beast && <img className="hot-beast" src={beast.src} alt="" decoding="async" loading="lazy" />}
                  <span className="hot-glyph" lang="zh-Hant" style={{ fontSize: glyphPx(h.w, 26) }}>
                    {h.w}
                  </span>
                  <span className="hot-acc">{h.accuracy}%</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { RankBadge } from "../components/RankBadge";
import { bank, cardById, qIndexById } from "../engine/bank";
import type { SubmitResult } from "../engine/api";
import { cardLevel, useProgress } from "../engine/progress";
import type { RankStats } from "../engine/score";
import type { RunSummary } from "../engine/types";
import { sfx } from "../engine/sfx";
import { glyphPx } from "../engine/glyph";
import { CardFace } from "../components/WordCard";
import { art, beastFor } from "../engine/art";

interface ResultState {
  summary: RunSummary;
  xpBefore: number;
  xpAfter: number;
  gain: number;
  multiplier: number;
  repeat: number;
  statsAfter: RankStats;
  server: Promise<SubmitResult | null>;
  rankUp: boolean;
  prestigeBefore: number;
  prestigeAfter: number;
}

function useCountUp(target: number, ms = 900): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setN(Math.round(target * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

function cardOfQuestion(qid: string): string {
  const qi = qIndexById.get(qid);
  return qi ? bank.cards[qi[1]].id : "";
}

export function Result({ state, onAgain, onWrong, onHome, onBoard }: { state: ResultState; onAgain: () => void; onWrong: () => void; onHome: () => void; onBoard: () => void }) {
  const { summary, gain, multiplier, repeat, statsAfter, rankUp, prestigeBefore, prestigeAfter } = state;
  const bonusGain = Math.max(0, prestigeAfter - prestigeBefore - gain); // 這局收服／三星／全通域／題海帶來的成就加成
  const progress = useProgress();
  const shown = useCountUp(summary.score);
  const [server, setServer] = useState<SubmitResult | null | "pending">("pending");
  const [revealed, setRevealed] = useState(0);
  const acc = summary.total ? Math.round((summary.correct / summary.total) * 100) : 0;
  const grade = summary.lost ? "敗" : acc === 100 ? "甲上" : acc >= 80 ? "甲" : acc >= 60 ? "乙" : acc >= 40 ? "丙" : "丁";
  const loot = summary.answers.filter((a) => a.correct).map((a) => cardOfQuestion(a.q)).filter((id, k, arr) => id && arr.indexOf(id) === k);

  useEffect(() => {
    let alive = true;
    state.server.then((r) => alive && setServer(r)).catch(() => alive && setServer(null));
    return () => {
      alive = false;
    };
  }, [state.server]);

  useEffect(() => {
    if (revealed >= loot.length) return;
    const t = window.setTimeout(() => {
      setRevealed((n) => n + 1);
      sfx.reveal();
    }, 900 + revealed * 260);
    return () => window.clearTimeout(t);
  }, [revealed, loot.length]);

  const wrongs = summary.answers.filter((a) => !a.correct);
  const modeName = summary.mode === "daily" ? "今日試煉" : summary.mode === "wrong" ? "復仇" : summary.mode === "lesson" ? "闖關" : "探險";

  return (
    <div className="result">
      <header className="result-head">
        <div className={`grade grade-${grade[0]}`} aria-label={`評等 ${grade}`}>
          {grade}
        </div>
        <h1 className="result-title">{summary.lost ? `燭火燃盡，${modeName}敗退` : `${modeName}告捷`}</h1>
        <div className="result-score">
          <span className="result-score-n">{shown}</span>
          <span className="result-score-t">分</span>
        </div>
        <ul className="result-stats">
          <li>
            <b>{summary.correct}</b>/{summary.total} 隻收服
          </li>
          <li>
            <b>{summary.maxCombo}</b> 最高連擊
          </li>
          <li>
            <b>{Math.round((summary.finishedAt - summary.startedAt) / 1000)}</b> 秒
          </li>
        </ul>
      </header>

      <section className={`result-rank${rankUp ? " is-up" : ""}`}>
        {rankUp && <div className="rank-up">升段！</div>}
        <RankBadge stats={statsAfter} size="lg" showBar />
        <p className="result-xp">
          學力 {prestigeBefore} → <b>{prestigeAfter}</b>（對局 +{gain}
          {bonusGain > 0 ? `、成就 +${bonusGain}` : ""}）
        </p>
        {multiplier < 1 && (
          <p className="result-repeat">
            本範圍今日第 {repeat + 1} 次出陣，學力 ×{multiplier}；收服與星數照算
          </p>
        )}
      </section>

      <section className="result-server">
        {server === "pending" ? (
          <p className="muted">戰報送往排行榜中…</p>
        ) : server && server.ok ? (
          server.scored ? (
            <p>
              排行：今日第 <b>{server.ranks.daily ?? "—"}</b> · 本週第 <b>{server.ranks.weekly ?? "—"}</b> · 總榜第 <b>{server.ranks.all ?? "—"}</b>
            </p>
          ) : (
            <p className="muted">{server.reason === "daily_done" ? "今日試煉每天只計一次排行，學力照常累積" : "練習局不計排行，學力照常累積"}</p>
          )
        ) : server && !server.ok ? (
          <p className="muted">{server.reason === "no_valid_answers" ? "題庫已更新，請重新整理後再戰" : "排行榜暫未接受這份戰報"}</p>
        ) : (
          <p className="muted">離線中，戰報已存本機</p>
        )}
      </section>

      {loot.length > 0 && (
        <section className="result-cards">
          <h2>收服</h2>
          <div className="reveal-row">
            {loot.map((id, k) => {
              const c = cardById.get(id);
              if (!c) return null;
              const isNew = summary.newCards.includes(id);
              const lvl = cardLevel(progress.cards[id]);
              return (
                <div key={id} className={`reveal tier-${c.tier}${k < revealed ? " is-open" : ""}`}>
                  <div className="reveal-inner">
                    <div className="reveal-back">
                      <img src={art.cardback} alt="" decoding="async" />
                    </div>
                    <div className={`reveal-front mini tier-${c.tier}${lvl >= 3 ? " is-mastered" : ""}`}>
                      <CardFace card={c} level={lvl} isNew={isNew} base={36} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {wrongs.length > 0 && (
        <section className="result-wrong">
          <h2>反擊過你的</h2>
          <ul>
            {wrongs.map((a) => {
              const c = cardById.get(cardOfQuestion(a.q));
              return (
                <li key={a.q} className={c ? `tier-${c.tier}` : ""}>
                  {c && <img className="wrong-beast" src={beastFor(c).src} alt="" decoding="async" loading="lazy" />}
                  <span className="wrong-glyph" lang="zh-Hant" style={{ fontSize: glyphPx(c?.w ?? "？", 28) }}>
                    {c?.w ?? "？"}
                  </span>
                  <span className="muted">{a.pick ? "落空" : "逾時"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="result-actions">
        <button type="button" className="btn btn-primary" onClick={onAgain}>
          再出陣
        </button>
        {wrongs.length > 0 && (
          <button type="button" className="btn" onClick={onWrong}>
            復仇
          </button>
        )}
        <button type="button" className="btn" onClick={onBoard}>
          看排行
        </button>
        <button type="button" className="btn btn-ghost" onClick={onHome}>
          回營
        </button>
      </div>
    </div>
  );
}

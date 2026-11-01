import { useEffect, useState } from "react";
import { fetchBoard, type BoardResult } from "../engine/api";
import { RANKS, emptyStats, rankOf } from "../engine/score";
import { RankEmblem } from "../components/RankEmblem";
import { useProgress } from "../engine/progress";

type Period = "daily" | "weekly" | "all";
const PERIODS: { id: Period; label: string; hint: string }[] = [
  { id: "daily", label: "今日", hint: "今日試煉首戰得分，每天計一次" },
  { id: "weekly", label: "本週", hint: "本週累計入帳學力" },
  { id: "all", label: "總榜", hint: "學力累計" },
];

/** 榜上的段位以伺服器算的為準（收服、通關依已送達的戰報）；舊伺服器沒給時只能用學力推估（其餘門檻當 0）。 */
const rankIdxOf = (r: { xp: number; rankIdx?: number }): number => r.rankIdx ?? rankOf(emptyStats(r.xp)).idx;

export function Board() {
  const [period, setPeriod] = useState<Period>("daily");
  const [data, setData] = useState<Record<Period, BoardResult | null | "loading">>({ daily: "loading", weekly: "loading", all: "loading" });
  const p = useProgress();

  useEffect(() => {
    let alive = true;
    setData((d) => ({ ...d, [period]: "loading" }));
    fetchBoard(period)
      .then((r) => alive && setData((d) => ({ ...d, [period]: r })))
      .catch(() => alive && setData((d) => ({ ...d, [period]: null })));
    return () => {
      alive = false;
    };
  }, [period]);

  const cur = data[period];

  return (
    <div className="board">
      <header className="board-head">
        <h1>排行榜</h1>
        <div className="seg" role="tablist">
          {PERIODS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={period === x.id} className={`seg-btn${period === x.id ? " is-on" : ""}`} onClick={() => setPeriod(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
      </header>

      {cur === "loading" ? (
        <p className="muted board-empty">讀取中…</p>
      ) : !cur ? (
        <div className="board-empty">
          <p className="muted">排行榜暫時連不上。本機：學力 {p.xp}、最佳 {p.best} 分</p>
        </div>
      ) : (
        <>
          {cur.rows.length >= 3 && (
            <ol className="podium">
              {[cur.rows[1], cur.rows[0], cur.rows[2]].map((r, k) => (
                <li key={r.rank} className={`podium-${r.rank}${r.me ? " is-me" : ""}`}>
                  <span className="podium-rank">{r.rank}</span>
                  <RankEmblem idx={rankIdxOf(r)} size={k === 1 ? 64 : 50} />
                  <span className="podium-nick">{r.nick || "無名氏"}</span>
                  <span className="podium-score">{r.score}</span>
                  <span className="podium-r">{RANKS[rankIdxOf(r)].name}</span>
                  <span className="sr-only">{k}</span>
                </li>
              ))}
            </ol>
          )}
          <ol className="rows" start={cur.rows.length >= 3 ? 4 : 1}>
            {(cur.rows.length >= 3 ? cur.rows.slice(3) : cur.rows).map((r) => (
              <li key={r.rank} className={`row${r.me ? " is-me" : ""}`}>
                <span className="row-rank">{r.rank}</span>
                <RankEmblem idx={rankIdxOf(r)} size={28} />
                <span className="row-nick">{r.nick || "無名氏"}</span>
                <span className="row-r">{RANKS[rankIdxOf(r)].name}</span>
                <span className="row-score">{r.score}</span>
              </li>
            ))}
          </ol>
          {cur.rows.length === 0 && <p className="board-empty">還沒有人上榜，去打今日試煉</p>}
          {cur.me && !cur.rows.some((r) => r.me) && (
            <div className="row is-me row-mine">
              <span className="row-rank">{cur.me.rank}</span>
              <RankEmblem idx={rankIdxOf(cur.me)} size={28} />
              <span className="row-nick">{cur.me.nick || "你"}</span>
              <span className="row-r">{RANKS[rankIdxOf(cur.me)].name}</span>
              <span className="row-score">{cur.me.score}</span>
            </div>
          )}
          <p className="board-foot">{cur.players} 位書生</p>
        </>
      )}
    </div>
  );
}

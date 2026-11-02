import { useEffect, useMemo, useState } from "react";
import { RankBadge } from "../components/RankBadge";
import { RankEmblem } from "../components/RankEmblem";
import { ThemeDial } from "../components/ThemePicker";
import { toast } from "../components/Toast";
import { fetchMe, pushNick } from "../engine/api";
import { exportProgress, rankStatsOf, resetProgress, setNick, setSound, useProgress } from "../engine/progress";
import { allQuestionIds, bank, questionIdsByLesson } from "../engine/bank";
import { completionOf } from "../engine/completion";
import { journeyRegions, journeySummary } from "../engine/journey";
import { RANKS, bonusOf, rankOf } from "../engine/score";
import { getSession, loginUrl, logout, type BdfzSession } from "../lib/identity";
import { markDirty, runSync, useSync } from "../lib/cloud";
import { sfx } from "../engine/sfx";

function syncLine(status: string, at?: number): string {
  if (status === "synced") return at ? `進度已同步（${new Date(at).toLocaleTimeString("zh-Hant", { hour: "2-digit", minute: "2-digit" })}）` : "進度已同步";
  if (status === "syncing") return "同步中…";
  if (status === "offline") return "暫時連不上雲端存檔，稍後會再試";
  if (status === "conflict") return "等你決定要不要把本機進度併入帳號";
  if (status === "error") return "同步出了點狀況，可以再試一次";
  return "";
}

export function Me() {
  const p = useProgress();
  const sync = useSync();
  const [nick, setNickLocal] = useState(p.nick);
  const [session, setSession] = useState<BdfzSession | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const stats = rankStatsOf(p, bank.lessons, allQuestionIds());
  const rank = rankOf(stats);
  // 題海：全部題目與各域關卡的題，答對過幾題（文曲之後的路，也是回頭補題的地圖）
  const regions = useMemo(() => journeyRegions(), []);
  const sea = useMemo(() => completionOf(p.q, allQuestionIds()), [p.q]);
  // 下一階要「走遍」更多域時，列出哪些域還沒全通（核心關卡），免得只看到「5/7 域」不知差在哪
  const incompleteRegions = useMemo(
    () =>
      regions
        .filter((rg) => !rg.region.bonus)
        .map((rg) => ({ name: rg.region.name, s: journeySummary(rg.stages.filter((l) => !l.bonus), p) }))
        .filter((x) => x.s.cleared < x.s.total)
        .map((x) => `${x.name} ${x.s.cleared}/${x.s.total}`),
    [regions, p],
  );
  const seaRows = useMemo(() => {
    const byL = questionIdsByLesson();
    return regions.map((rg) => ({ id: rg.region.id, name: rg.region.name, c: completionOf(p.q, rg.stages.flatMap((l) => byL.get(l.id) || [])) }));
  }, [regions, p.q]);

  useEffect(() => {
    getSession().then(setSession).catch(() => setSession({ authenticated: false, user: null }));
    fetchMe()
      .then((me) => {
        if (me && me.nick && !p.nick) {
          setNick(me.nick);
          setNickLocal(me.nick);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveNick() {
    const v = nick.trim().slice(0, 12);
    setNick(v);
    markDirty();
    const r = await pushNick(v);
    toast(r ? "暱稱已更新" : "已存本機，稍後同步排行榜", r ? "gold" : "info");
  }

  function useUcName() {
    const name = session?.user?.display_name || session?.user?.displayName || session?.user?.slug || "";
    if (name) {
      setNickLocal(name);
      setNick(name);
      markDirty();
      void pushNick(name);
    }
  }

  const acc = p.totalAnswered ? Math.round((p.totalCorrect / p.totalAnswered) * 100) : 0;
  const ucName = session?.user?.display_name || session?.user?.displayName || session?.user?.slug || "";

  return (
    <div className="me">
      <header className="me-head">
        <RankBadge stats={stats} size="lg" showBar />
      </header>

      <section className="panel">
        <ul className="me-stats">
          <li>
            <b>{p.games}</b>
            <span>局數</span>
          </li>
          <li>
            <b>{p.best}</b>
            <span>單局最佳</span>
          </li>
          <li>
            <b>{p.bestCombo}</b>
            <span>最高連擊</span>
          </li>
          <li>
            <b>{acc}%</b>
            <span>正確率</span>
          </li>
          <li>
            <b>{p.dayStreak}</b>
            <span>連日出陣</span>
          </li>
          <li>
            <b>{Object.values(p.cards || {}).filter((c) => c && c.masteredAt).length}</b>
            <span>收服</span>
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>學術之路</h2>
        <p className="muted sea-note">
          學力 <b>{rank.prestige}</b>＝對局入帳 {p.xp} ＋ 成就加成 {bonusOf(stats)}（收服 {stats.mastered} 隻 ×30、三星通關 {stats.cleared} 關 ×120、全通 {stats.regions} 域 ×1,500、題海 {stats.done} 題 ×4）。段位只看學力；文聖另須題庫每一題都答對過。
          {incompleteRegions.length > 0 ? ` 尚未全通：${incompleteRegions.join("、")}（全通一域 +1,500）。` : ""}
        </p>
        <ol className="ladder">
          {RANKS.map((r, i) => {
            const reached = i <= rank.idx;
            const current = i === rank.idx;
            const isNext = i === rank.idx + 1;
            // 門檻只看學力（對局入帳＋成就加成，v2.10）；下一階顯示「現在／門檻」；文聖另須題庫每一題都答對過
            const sea = r.all ? (isNext ? ` · 題海 ${stats.done}/${stats.total}（全部題目）` : " · 題海 全部題目") : "";
            const req = i === 0 ? "起點" : isNext ? `學力 ${rank.prestige}/${r.xp}${sea}` : `學力 ${r.xp}${sea}`;
            return (
              <li key={r.name} className={`ladder-row${reached ? " is-reached" : ""}${current ? " is-current" : ""}`}>
                <RankEmblem idx={i} size={44} />
                <div className="ladder-body">
                  <b lang="zh-Hant">{r.name}</b>
                  <span>{i === RANKS.length - 1 ? `${req} · 頂峰` : req}</span>
                  {current && rank.next && (
                    <i className="ladder-bar">
                      <i style={{ width: `${Math.max(2, rank.progress * 100)}%` }} />
                    </i>
                  )}
                </div>
                <span className="ladder-state">{current ? "現在" : reached ? "已達" : ""}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="panel">
        <h2>題海</h2>
        <p className="muted sea-note">題海每答對一題 +4 學力；題庫裡每一題都答對過才有文聖。重返關卡時，沒做過與沒答對過的題會先出；每題都答對過的關卡在地圖上多一圈金環。</p>
        <ul className="sea">
          {seaRows.map((row) => (
            <li key={row.id} className={row.c.left === 0 && row.c.total > 0 ? "is-full" : ""}>
              <span className="sea-name" lang="zh-Hant">
                {row.name}
              </span>
              <i className="sea-bar">
                <i style={{ width: `${Math.max(1, row.c.ratio * 100)}%` }} />
              </i>
              <span className="sea-num">
                <b>{row.c.done}</b>/{row.c.total}
              </span>
            </li>
          ))}
        </ul>
        <p className="sea-total">
          全部題目 <b>{sea.done}</b>/{sea.total} · {Math.round(sea.ratio * 100)}%{sea.left === 0 && sea.total > 0 ? " · 題海無涯，全題完成" : ""}
        </p>
      </section>

      <section className="panel">
        <h2>暱稱</h2>
        <div className="row-form">
          <input className="input" value={nick} maxLength={12} placeholder="排行榜上的名字" onChange={(e) => setNickLocal(e.target.value)} />
          <button type="button" className="btn btn-primary" onClick={saveNick}>
            儲存
          </button>
        </div>
        {session?.authenticated ? (
          <>
            <p className="me-uc">
              用戶中心：{ucName}
              <button type="button" className="link" onClick={useUcName}>
                用這個名字
              </button>
              <button
                type="button"
                className="link"
                onClick={async () => {
                  await logout();
                  setSession({ authenticated: false, user: null });
                  void runSync();
                }}
              >
                登出
              </button>
            </p>
            <p className="me-sync">
              <span>{syncLine(sync.status, sync.at) || "進度會在登入同一帳號的裝置間同步"}</span>
              {sync.status !== "syncing" && sync.status !== "conflict" && (
                <button type="button" className="link" onClick={() => void runSync()}>
                  立即同步
                </button>
              )}
            </p>
            <p className="me-hint">登入同一帳號的手機、電腦共用這份進度；本機與雲端合併時只取多不取少，收服、星數、局數都不會因同步而減少。</p>
          </>
        ) : (
          <p className="me-uc">
            <a className="link" href={loginUrl()}>
              登入用戶中心
            </a>
            後，進度在各裝置之間同步，每局也計入學習記錄
          </p>
        )}
      </section>

      <section className="panel">
        <h2>色系與音效</h2>
        <div className="dial-row">
          <ThemeDial size={56} />
          <span>點一下轉盤就換一套，宣紙、青瓷、墨夜、玄青輪著來</span>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={p.sound}
            onChange={(e) => {
              setSound(e.target.checked);
              if (e.target.checked) sfx.correct(1);
            }}
          />
          <span>音效</span>
        </label>
        <div className="row-form">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const blob = new Blob([exportProgress()], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `ziling-${Date.now()}.json`;
              a.click();
            }}
          >
            匯出存檔
          </button>
          {confirmReset ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                resetProgress();
                setConfirmReset(false);
                toast("本機進度已清空");
              }}
            >
              確定清空？
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
              清空本機進度
            </button>
          )}
        </div>
        {p.owner && <p className="me-hint">清空只影響這台裝置；帳號的雲端存檔不會被清掉，登入狀態下會再合併回來。</p>}
      </section>

      <section className="panel about">
        <h2>題庫</h2>
        <p>題庫只收文學最關鍵的知識：名篇名句、作家與代表作、人物、稱號、並稱流派、文論與文體、諾貝爾得主與真題。每一題都由已登記來源的事實生成：詩文名句逐字核對統編課本（琅琅）、《唐詩三百首》《宋詞三百首》與風雅千載語料，原文與通行本不同時在解析註明；世界文學的作者、成書年代與人物經 Wikidata 核對；諾貝爾得主的年份與授獎辭取自 nobelprize.org 官方資料並逐字核對。詞牌、曲牌、樂府舊題與同代他人共用的題名不出「題名→作者」題，改考名句。稀有度依課本、真題與世界知名度排序。</p>
      </section>
    </div>
  );
}

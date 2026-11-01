import { useEffect, useMemo, useRef, useState } from "react";
import type { RunRequest } from "../App";
import { Stars } from "../components/RankBadge";
import { art, beastById, warm } from "../engine/art";
import { prefetchChunks, qIndexById, questionIdsByLesson } from "../engine/bank";
import { completionOf } from "../engine/completion";
import { currentRegion, journeyRegions, journeySummary, type RegionStages } from "../engine/journey";
import type { Progress } from "../engine/progress";

interface Pick {
  r: number;
  k: number;
}

function pathOf(rg: RegionStages): string {
  // x 以 0–100 對應域寬，y 以像素對應域高（viewBox 跟著域高走）
  let d = "";
  rg.pos.forEach((p, k) => {
    if (k === 0) d += `M${p.x} ${p.y}`;
    else {
      const q = rg.pos[k - 1];
      const my = (q.y + p.y) / 2;
      d += ` C${q.x} ${my}, ${p.x} ${my}, ${p.x} ${p.y}`;
    }
  });
  return d;
}

/** 旅程：七域連成一張古靈異地圖，各域有自己的守護異獸；關卡是地圖上的燈與印，不標號碼。點一下看關卡、再點出陣。 */
export function Journey({ onStart, progress }: { onStart: (r: RunRequest) => void; progress: Progress }) {
  const regions = useMemo(() => journeyRegions(), []);
  const cur = useMemo(() => currentRegion(regions, progress), [regions, progress]);
  const [sel, setSel] = useState<Pick>(cur);
  const nodeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const all = useMemo(() => {
    let cleared = 0;
    let stars = 0;
    let total = 0;
    for (const rg of regions) {
      const s = journeySummary(rg.stages, progress);
      cleared += s.cleared;
      stars += s.stars;
      total += s.total;
    }
    return { cleared, stars, total };
  }, [regions, progress]);

  useEffect(() => {
    const rg = regions[cur.r];
    if (rg) prefetchChunks(rg.region.books);
    // 只預熱眼前這域與前後一域的地圖：九張一起拉會讓眼前那張排隊（10-31 Mac Chrome／Brave「加載不正常」）
    warm(regions.slice(Math.max(0, cur.r - 1), cur.r + 2).map((x) => x.region.map));
    const el = nodeRefs.current.get(`${cur.r}-${cur.k}`);
    if (el) {
      const t = window.setTimeout(() => el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }), 60);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selRg = regions[sel.r];
  const selStage = selRg?.stages[sel.k];
  const selStat = selStage ? progress.stages[selStage.id] : undefined;
  const byLesson = useMemo(() => questionIdsByLesson(), []);
  const selSea = selStage ? completionOf(progress.q, byLesson.get(selStage.id) || []) : null;
  // 「N 隻」＝這關有幾隻書靈（不同的卡），題數另以「題 x/y」顯示（10-31 前兩者都寫題數，钱塘湖春行曾顯示 4 隻卻只有 2 題可出）
  const selCards = selStage ? new Set((byLesson.get(selStage.id) || []).map((id) => qIndexById.get(id)?.[1])).size : 0;

  function start(p: Pick) {
    const rg = regions[p.r];
    const l = rg?.stages[p.k];
    if (!rg || !l) return;
    onStart({ mode: "lesson", scope: l.id, label: `${rg.region.name} 第 ${p.k + 1} 關 《${l.title}》`, seed: `${Date.now()}` });
  }

  return (
    <div className="journey">
      <header className="journey-head">
        <h1>旅程</h1>
        <span className="journey-sum">
          通關 <b>{all.cleared}</b>/{all.total} · <img src={art.star} alt="星" className="jc-star" /> <b>{all.stars}</b>/{all.total * 3}
        </span>
      </header>

      <div className="worldmap">
        {regions.map((rg, r) => {
          // 域的「全通」只看核心關卡；選文關卡另計，既有的全通不會因新增選文而退回。附加域（杏壇、貢院）本身不入全通域，整域照常計數
          const sum = journeySummary(rg.region.bonus ? rg.stages : rg.stages.filter((l) => !l.bonus), progress);
          const extra = rg.region.bonus ? [] : rg.stages.filter((l) => l.bonus);
          const bsum = extra.length ? journeySummary(extra, progress) : null;
          const guardian = beastById(rg.region.guardian);
          const isHere = r === cur.r;
          const path = pathOf(rg);
          return (
            <section key={rg.region.id} className={`region${isHere ? " is-here" : ""}${sum.cleared === sum.total ? " is-done" : ""}`} style={{ height: rg.height, "--accent": rg.region.accent } as React.CSSProperties} aria-label={`${rg.region.name}（${rg.region.sub}）`}>
              <img className="region-map" src={rg.region.map} alt="" decoding="async" loading={Math.abs(r - cur.r) <= 1 ? "eager" : "lazy"} fetchPriority={r === cur.r ? "high" : "auto"} />
              <span className="region-veil" aria-hidden="true" />
              <header className="region-head">
                {guardian && <img className="region-guardian" src={guardian.src} alt={guardian.name} decoding="async" />}
                <div className="region-name">
                  <h2 lang="zh-Hant">{rg.region.name}</h2>
                  <span>{rg.region.sub}</span>
                </div>
                <span className="region-sum">
                  <b>{sum.cleared}</b>/{sum.total}
                  <img src={art.star} alt="星" />
                  <b>{sum.stars}</b>
                  {bsum && (
                    <i className="region-bonus" lang="zh-Hant">
                      選文 {bsum.cleared}/{bsum.total}
                    </i>
                  )}
                </span>
              </header>
              <svg className="region-path" viewBox={`0 0 100 ${rg.height}`} preserveAspectRatio="none" aria-hidden="true">
                <path className="region-path-glow" d={path} />
                <path className="region-path-line" d={path} />
              </svg>
              {rg.stages.map((l, k) => {
                const stars = progress.stages[l.id]?.stars || 0;
                const isNext = isHere && k === cur.k;
                const isSel = sel.r === r && sel.k === k;
                const { x, y } = rg.pos[k];
                const coin = stars === 3 ? art.node.clear : stars ? art.node.lit : art.node.off;
                const full = completionOf(progress.q, byLesson.get(l.id) || []).left === 0; // 題海：這關每一題都答對過
                return (
                  <button
                    key={l.id}
                    type="button"
                    ref={(el) => {
                      if (el) nodeRefs.current.set(`${r}-${k}`, el);
                    }}
                    className={`stage${stars === 3 ? " is-clear" : stars ? " is-partial" : " is-open"}${isNext ? " is-next" : ""}${isSel ? " is-sel" : ""}${full ? " is-full" : ""}`}
                    style={{ left: `${x}%`, top: `${y}px` }}
                    aria-label={`${rg.region.name} 第 ${k + 1} 關 ${l.title} ${stars} 星${full ? " 全題完成" : ""}`}
                    onClick={() => (isSel ? start({ r, k }) : setSel({ r, k }))}
                  >
                    <span className="stage-coin">
                      <img src={coin} alt="" decoding="async" />
                    </span>
                    {isNext && <img className="stage-you" src={art.logo} alt="你在這裡" decoding="async" />}
                    <Stars n={stars} size={11} />
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      {selStage && selRg && (
        <div className="stage-card" style={{ "--accent": selRg.region.accent } as React.CSSProperties}>
          <span className="stage-card-no">{sel.k + 1}</span>
          <div className="stage-card-body">
            <b lang="zh-Hant">{selStage.title}</b>
            <span>
              {[selRg.region.name, selStage.exam ? "真題" : selStage.bonus && !selRg.region.bonus ? "選文" : "", selStage.author || "", `${selCards} 隻`, selSea ? `題 ${selSea.done}/${selSea.total}` : "", selStat ? `最佳 ${selStat.best}` : ""]
                .filter(Boolean)
                .map((part, i) => (
                  <span key={part} className="stage-card-part">
                    {i > 0 && " · "}
                    {part}
                  </span>
                ))}
            </span>
          </div>
          <Stars n={selStat?.stars || 0} />
          <button type="button" className="btn btn-primary stage-go" onClick={() => start(sel)}>
            出陣
          </button>
        </div>
      )}
    </div>
  );
}

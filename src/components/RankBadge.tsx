import { art } from "../engine/art";
import { rankOf, type RankKey, type RankStats } from "../engine/score";

const NEED_PREFIX: Record<RankKey, string> = { xp: "再 ", done: "再答對 " };
const NEED_UNIT: Record<RankKey, string> = { xp: " 學力", done: " 題" };
import { RankEmblem } from "./RankEmblem";

/** 金星：點亮的用畫出來的金星，未亮的只剩灰影。 */
export function Stars({ n, of = 3, size = 14 }: { n: number; of?: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${n} 星`}>
      {Array.from({ length: of }, (_, k) => (
        <img key={k} className={k < n ? "is-on" : ""} src={art.star} alt="" width={size} height={size} decoding="async" />
      ))}
    </span>
  );
}

/** 段位徽章＋進度。進度條不放文字；差多少另起一行（四項門檻裡還沒到的），字級夠大。 */
export function RankBadge({ stats, size = "md", showBar = false }: { stats: RankStats; size?: "sm" | "md" | "lg"; showBar?: boolean }) {
  const r = rankOf(stats);
  // 文曲之上的題海四階（文昌、魁星、紫微、文聖）就在段位表裡：進度條與「還差」一律走同一套門檻（stats.done＝答對過的題數）
  const pct = r.progress * 100;
  return (
    <div className={`rank rank-${size}`}>
      <RankEmblem idx={r.idx} size={size === "lg" ? 96 : size === "sm" ? 40 : 66} />
      <div className="rank-text">
        <div className="rank-name">
          <b>{r.name}</b>
          <Stars n={r.stars} />
        </div>
        {showBar && (
          <>
            <div className="rank-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="rank-bar-fill" style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            <p className="rank-next">
              {r.next ? (
                <>
                  {r.needs.map((n, k) => (
                    <span key={n.key}>
                      {k > 0 && "、"}
                      {NEED_PREFIX[n.key]}
                      <b>{n.left}</b>
                      {NEED_UNIT[n.key]}
                    </span>
                  ))}
                  ，升<b>{r.next.name}</b>
                </>
              ) : (
                <>
                  題海無涯 · <b>全題完成</b> · 已達頂峰
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

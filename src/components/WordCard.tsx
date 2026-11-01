import type { CardMeta } from "../engine/types";
import { art, beastFor } from "../engine/art";
import { glyphPx } from "../engine/glyph";

/** 把帶【】的原句拆成片段，標目標字。比較題（甲／乙或例句）逐行顯示。 */
export function Sentence({ s, className = "" }: { s: string; className?: string }) {
  const lines = s.split("\n");
  return (
    <div className={`sentence ${className}`}>
      {lines.map((line, i) => {
        const parts = line.split(/(【[^【】]+】)/g).filter(Boolean);
        return (
          <p key={i}>
            {parts.map((p, j) =>
              p.startsWith("【") ? (
                <mark key={j} className="target">
                  {p.slice(1, -1)}
                </mark>
              ) : (
                <span key={j}>{p}</span>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

/** 卡面（圖鑑／戰利品共用）：書靈獸在卡底若隱若現，字在前；依稀有度換框與寶石——常見素框、稀有青框、史詩紫紋雙框、傳說金飾框＋流光。 */
export function CardFace({ card, level, isNew = false, base = 34 }: { card: CardMeta; level: number; isNew?: boolean; base?: number }) {
  const beast = beastFor(card);
  return (
    <>
      <img className="mini-beast" src={beast.src} alt="" decoding="async" loading="lazy" aria-hidden="true" />
      <span className="mini-frame" aria-hidden="true" />
      {card.tier === "SSR" && <span className="mini-holo" aria-hidden="true" />}
      <img className={`mini-gem gem gem-${card.tier}`} src={art.gem[card.tier]} alt="" aria-hidden="true" decoding="async" />
      <span className="mini-glyph" lang="zh-Hant" style={{ fontSize: glyphPx(card.w, base) }}>
        {card.w}
      </span>
      {isNew ? (
        <span className="mini-new">新</span>
      ) : (
        <span className="mini-stars" aria-label={`${level} 星`}>
          {Array.from({ length: Math.min(5, level) }, (_, k) => (
            <img key={k} src={art.star} alt="" decoding="async" />
          ))}
        </span>
      )}
    </>
  );
}

export function MiniCard({ card, level, onClick }: { card: CardMeta; level: number; onClick?: () => void }) {
  return (
    <button type="button" className={`mini tier-${card.tier}${level >= 3 ? " is-mastered" : ""}${level === 0 ? " is-locked" : ""}`} onClick={onClick} aria-label={`${card.w}，${level} 星`}>
      <CardFace card={card} level={level} />
    </button>
  );
}

import { art } from "../engine/art";
import { RANKS } from "../engine/score";

/** 科舉十二階徽章：鐵石→青銅→翠玉→紫銀→赤金→翎金→冠龍→輝星（文曲），之上題海四階：文昌（白金藍寶）→魁星（紫金北斗）→紫微（帝紫極星）→文聖（金玉日輪），全是畫出來的圓章。 */
export function RankEmblem({ idx, size = 60, className = "" }: { idx: number; size?: number; className?: string }) {
  const i = Math.max(0, Math.min(art.rank.length - 1, idx));
  return (
    <span className={`emblem emblem-${i + 1} ${className}`} style={{ width: size, height: size }}>
      <img src={art.rank[i]} alt={RANKS[i]?.name ?? ""} width={size} height={size} decoding="async" />
    </span>
  );
}

/** 計分與段位。前端與 Worker 共用：伺服器以同一公式重算，排行榜以伺服器結果為準。 */
import type { QType, Tier } from "./types";

export const LIMIT_MS = 20000; // 每題限時
/** 真題（北京卷、指考）要先讀完一首詩或一段文字，再比較四個長選項，限時放寬到 90 秒（2026-11-02） */
export const EXAM_LIMIT_MS = 90000;
export const limitOf = (type: QType): number => (type === "exam" ? EXAM_LIMIT_MS : LIMIT_MS);
export const RUN_SIZE = 10; // 每局題數
export const TIER_BASE: Record<Tier, number> = { N: 10, R: 14, SR: 18, SSR: 24 };
export const TYPE_BONUS: Record<QType, number> = { who: 0, work: 2, line: 2, era: 0, kw: 4, lang: 1, year: 2, exam: 4 };

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** 單題得分：基礎分（依稀有度＋題型）＋速度加成（最多 +50%）× 連擊倍率（最多 ×1.9）。答錯 0 分。 */
export function questionScore(args: { correct: boolean; tier: Tier; type: QType; ms: number; combo: number }): number {
  if (!args.correct) return 0;
  const base = TIER_BASE[args.tier] + TYPE_BONUS[args.type];
  const limit = limitOf(args.type);
  const ms = args.ms < 300 ? limit : args.ms; // 不足 0.3 秒視為異常，不給速度分
  const speed = clamp(1 - ms / limit, 0, 1);
  const bonus = Math.round(base * 0.5 * speed);
  const mult = 1 + clamp(args.combo - 1, 0, 9) * 0.1;
  return Math.round((base + bonus) * mult);
}

export interface RankDef {
  name: string;
  glyph: string;
  tone: string;
  /** 學力門檻（學力＝對局入帳＋成就加成，見 prestigeOf） */
  xp: number;
  /** 最高階：另須題庫裡每一題都答對過 */
  all?: boolean;
}

/** 段位的四項原料（對局入帳學力、收服、三星通關、全通域）＋題海（答對過一次的題數／題庫總題數） */
export interface RankStats {
  xp: number;
  mastered: number;
  cleared: number;
  regions: number;
  done?: number;
  total?: number;
}

/** 成就加成（2026-10-31 v2.10，站長定案「成就併入學力」：排行與段位要一條尺）：
 * 收服每隻 +30、三星通關每關 +120、全通一域 +1,500、題海每題 +4。 */
// 書靈（設計方案 §7.1）：全通一域 +2,500；題海每題 +4 沿用書靈，真題、精通、合璧、宗師、論衡的加成待那些玩法上線再加。
export const BONUS = { mastered: 30, cleared: 120, regions: 2500, done: 4 } as const;

export function bonusOf(s: RankStats): number {
  return s.mastered * BONUS.mastered + s.cleared * BONUS.cleared + s.regions * BONUS.regions + (s.done || 0) * BONUS.done;
}

/** 學力＝對局入帳（xp）＋成就加成。段位門檻、首頁與我的頁的學力、總榜都看這個數。 */
export function prestigeOf(s: RankStats): number {
  return s.xp + bonusOf(s);
}

/** 科舉段位（2026-10-31 v2.10）：只看學力門檻，門檻依當日 34 位線上玩家校準，無人降階（reports/operations/wygame-v210-20261031/calibrate-v210.txt）；
 * 文聖另須題庫裡每一題都答對過（站長：做完做對全部題目的人給最高等級）。此前的四項門檻（收服／通關／全通域）改為加成，見 docs/RANK_DESIGN.md。 */
export const RANKS: RankDef[] = [
  // 學術之路十二階（設計方案 §7.2）。名稱不與書靈的科舉十二階重複。
  // 通人的正式門檻是「學力 300,000＋十一域核心全通＋論衡殿通過」；P1 只有兩域、論衡殿未建，暫以「題庫每一題都答對過」代替，P4 換成正式門檻。
  { name: "童蒙", glyph: "蒙", tone: "#9aa5a1", xp: 0 },
  { name: "書生", glyph: "書", tone: "#5aa9e6", xp: 1500 },
  { name: "庠生", glyph: "庠", tone: "#4fb08a", xp: 5000 },
  { name: "太學生", glyph: "太", tone: "#b48ef1", xp: 12000 },
  { name: "儒生", glyph: "儒", tone: "#e6c36b", xp: 24000 },
  { name: "博士", glyph: "博", tone: "#f0a35e", xp: 40000 },
  { name: "校書", glyph: "校", tone: "#ff6b4a", xp: 60000 },
  { name: "著作", glyph: "著", tone: "#ffd36b", xp: 85000 },
  { name: "蘭臺", glyph: "蘭", tone: "#8fd3ff", xp: 115000 },
  { name: "學士", glyph: "學", tone: "#c9a7ff", xp: 150000 },
  { name: "祭酒", glyph: "祭", tone: "#ff9ad5", xp: 200000 },
  { name: "通人", glyph: "通", tone: "#fff1b0", xp: 300000, all: true },
];

/** 文曲的索引（之上是題海四階） */
export const WENQU_IDX = 7;

export type RankKey = "xp" | "done";
export const RANK_KEYS: RankKey[] = ["xp", "done"];

export interface RankNeed {
  key: RankKey;
  have: number;
  need: number;
  left: number;
}

export interface RankInfo {
  idx: number;
  name: string;
  glyph: string;
  tone: string;
  stars: number; // 0..3 within the rank
  progress: number; // 0..1 to next rank
  next: RankDef | null;
  toNext: number; // 還差的學力
  needs: RankNeed[]; // 下一階還沒達到的門檻
  prestige: number; // 學力（對局入帳＋成就加成）
}

/** 某一階是否達到：學力門檻；最高階另須全部題目答對過（題庫總題數未知時視為達不到） */
export function meetsRank(s: RankStats, r: RankDef): boolean {
  if (prestigeOf(s) < r.xp) return false;
  if (r.all) return !!s.total && s.total > 0 && (s.done || 0) >= s.total;
  return true;
}

export function emptyStats(xp = 0): RankStats {
  return { xp, mastered: 0, cleared: 0, regions: 0, done: 0, total: 0 };
}

/** 段位索引：從低到高連續達標的最高一階。prestige 已含成就加成；done／total 只決定文聖。 */
export function rankIdxOf(prestige: number, done = 0, total = 0): number {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    const r = RANKS[i];
    const ok = prestige >= r.xp && (!r.all || (total > 0 && done >= total));
    if (ok) idx = i;
    else break;
  }
  return idx;
}

export function rankOf(stats: RankStats): RankInfo {
  const prestige = prestigeOf(stats);
  const idx = rankIdxOf(prestige, stats.done || 0, stats.total || 0);
  const cur = RANKS[idx];
  const next = RANKS[idx + 1] || null;
  const needs: RankNeed[] = [];
  let progress = 1;
  if (next) {
    progress = next.xp <= cur.xp ? 1 : clamp((prestige - cur.xp) / (next.xp - cur.xp), 0, 1);
    if (prestige < next.xp) needs.push({ key: "xp", have: prestige, need: next.xp, left: next.xp - prestige });
    if (next.all) {
      const total = stats.total || 0;
      const done = stats.done || 0;
      if (total > 0) {
        progress = Math.min(progress, clamp(done / total, 0, 1));
        if (done < total) needs.push({ key: "done", have: done, need: total, left: total - done });
      } else progress = 0;
    }
  }
  return { idx, name: cur.name, glyph: cur.glyph, tone: cur.tone, stars: next ? Math.min(3, Math.floor(progress * 3) + 1) : 3, progress, next, toNext: next ? Math.max(0, next.xp - prestige) : 0, needs, prestige };
}

export const NEED_LABEL: Record<RankKey, (n: number) => string> = {
  xp: (n) => `再 ${n} 學力`,
  done: (n) => `再答對 ${n} 題`,
};

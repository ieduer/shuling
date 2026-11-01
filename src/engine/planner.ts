/** 出題規劃：每日挑戰（全站同題）、自由對陣（依範圍與掌握度加權）、攻錯（錯題優先）、單課闖關。 */
import { ALL_MASK, BOOK_BIT, bank, cardOfIndex } from "./bank";
import { RUN_SIZE } from "./score";
import { rngFrom, shuffle, pickWeighted } from "./rng";
import { fillToMinimum } from "./pick";
import type { Progress } from "./progress";
import { cardLevel } from "./progress";
import { STAGE_MIN_QUESTIONS } from "./rank";
import type { QIndex, Tier } from "./types";
import { TYPE_NAMES } from "./types";

const TIER_ORDER: Tier[] = ["N", "R", "SR", "SSR"];

function uniqueCards(picked: QIndex[], candidate: QIndex): boolean {
  return !picked.some((p) => p[1] === candidate[1]);
}

/** 每日挑戰：同一天全站同一組題（3 常見、3 稀有、2 史詩、2 傳說，題型混合，不含長題）。 */
export function planDaily(seed: string): string[] {
  const rand = rngFrom(`daily|${seed}|${bank.v}`);
  const pool = bank.qi.slice();
  const byTier: Record<Tier, QIndex[]> = { N: [], R: [], SR: [], SSR: [] };
  for (const q of pool) byTier[cardOfIndex(q).tier].push(q);
  const want: [Tier, number][] = [["N", 3], ["R", 3], ["SR", 2], ["SSR", 2]];
  const picked: QIndex[] = [];
  for (const [tier, n] of want) {
    const list = shuffle(byTier[tier], rand);
    let taken = 0;
    for (const q of list) {
      if (taken >= n) break;
      if (!uniqueCards(picked, q)) continue;
      picked.push(q);
      taken++;
    }
  }
  // 由易到難，最後一張是「頭目」
  picked.sort((a, b) => TIER_ORDER.indexOf(cardOfIndex(a).tier) - TIER_ORDER.indexOf(cardOfIndex(b).tier) || a[5] - b[5]);
  return picked.map((q) => q[0]);
}

export function maskOfScope(scope: string): number {
  if (scope === "all") return ALL_MASK;
  if (scope === "zh") return bank.books.filter((b) => b.region === "zh").reduce((m, b) => m | BOOK_BIT[b.id], 0);
  if (scope === "world") return bank.books.filter((b) => b.region === "world").reduce((m, b) => m | BOOK_BIT[b.id], 0);
  if (scope === "exam") return (BOOK_BIT.bj || 0) | (BOOK_BIT.ceec || 0);
  return BOOK_BIT[scope] || ALL_MASK;
}

function weightFor(q: QIndex, p: Progress): number {
  const card = cardOfIndex(q);
  const qs = p.q[q[0]];
  const cs = p.cards[card.id];
  let w = 1;
  // 題海（2026-10-31）：文曲之後要把每一題都答對一次——沒做過與從沒答對過的題最先出，重返關卡才會一直見到新題
  if (!qs) w = 4; // 沒做過的題優先
  else if (qs.ok === 0) w = 4.5; // 做過但從沒答對：最優先
  else if (qs.bad > qs.ok) w = 3; // 錯多於對的題再來
  else if (qs.streak >= 3) w = 0.35; // 連對三次就少出
  if (!cs) w *= 1.4; // 沒見過的卡優先
  else if (cardLevel(cs) >= 5) w *= 0.3;
  w *= card.tier === "SSR" ? 1.3 : card.tier === "SR" ? 1.15 : 1;
  return w;
}

/** 自由對陣：在範圍內依掌握度加權抽題，單局卡片不重複，比較題不超過 3 道。 */
export function planFree(p: Progress, scope: string, seed: string, size = RUN_SIZE): string[] {
  const mask = maskOfScope(scope);
  const rand = rngFrom(`free|${seed}`);
  let pool = bank.qi.filter((q) => (q[4] & mask) !== 0);
  if (pool.length === 0) pool = bank.qi.slice();
  const picked: QIndex[] = [];
  let compare = 0;
  let guard = 0;
  while (picked.length < size && guard++ < 4000 && pool.length) {
    const q = pickWeighted(pool, (x) => weightFor(x, p), rand);
    if (!q) break;
    const t = TYPE_NAMES[q[2]];
    const isCompare = t === "kw"; // 授獎辭題一局最多三題，免得整局都是英文短語
    if (!uniqueCards(picked, q) || (isCompare && compare >= 3)) {
      pool = pool.filter((x) => x !== q);
      continue;
    }
    picked.push(q);
    if (isCompare) compare++;
    pool = pool.filter((x) => x !== q);
  }
  picked.sort((a, b) => a[5] - b[5]);
  return picked.map((q) => q[0]);
}

/** 攻錯：最近錯過的題優先，不足則補同卡其他題。 */
export function planWrong(p: Progress, seed: string, size = RUN_SIZE): string[] {
  const rand = rngFrom(`wrong|${seed}`);
  const picked: QIndex[] = [];
  for (const id of p.misses) {
    const q = bank.qi.find((x) => x[0] === id);
    if (q && uniqueCards(picked, q)) picked.push(q);
    if (picked.length >= size) break;
  }
  if (picked.length < size) {
    const rest = shuffle(bank.qi.filter((q) => uniqueCards(picked, q) && p.q[q[0]] && p.q[q[0]].bad > 0), rand);
    for (const q of rest) {
      if (picked.length >= size) break;
      if (uniqueCards(picked, q)) picked.push(q);
    }
  }
  if (picked.length < size) {
    for (const id of planFree(p, "all", seed + "|fill", size)) {
      if (picked.length >= size) break;
      const q = bank.qi.find((x) => x[0] === id);
      if (q && uniqueCards(picked, q)) picked.push(q);
    }
  }
  return shuffle(picked, rand).map((q) => q[0]);
}

/** 單課闖關：該課所有題（最多 size 道），沒做過與錯過的優先。 */
export function planLesson(p: Progress, lessonId: string, seed: string, size = RUN_SIZE): string[] {
  const rand = rngFrom(`lesson|${lessonId}|${seed}`);
  const all = bank.qi.filter((q) => q[6] === lessonId);
  let pool = all;
  const picked: QIndex[] = [];
  while (picked.length < size && pool.length) {
    const q = pickWeighted(pool, (x) => weightFor(x, p), rand);
    if (!q) break;
    pool = pool.filter((x) => x !== q);
    if (uniqueCards(picked, q) || picked.length >= pool.length) picked.push(q);
  }
  // 課內書靈不到三隻時（钱塘湖春行、十五从军征、幾張真題卷），同一隻的題也要湊滿三題：伺服器只把「≥3 題全對」的一局算通關（2026-10-31）
  const full = fillToMinimum(picked, all, (rest) => shuffle(rest, rand), STAGE_MIN_QUESTIONS, size);
  full.sort((a, b) => a[5] - b[5]);
  return full.map((q) => q[0]);
}

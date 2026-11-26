/** 段位統計（前端與 Worker 共用，純函數、無執行期匯入）：
 * 收服＝書靈淨答對三次以上；通關＝該關一局全對（三星）；全通一域＝域內每一關都三星。十四域順序固定（與旅程地圖同序）。 */
export const REGION_BOOKS = ["shi", "wen", "shuo", "xin", "aegean", "rome", "east", "europe", "c19", "modern", "fusang", "nobel", "schools", "exam"] as const;
/** 附加域的冊別（杏壇書院＝論語、龍門貢院＝北京卷與指考真題，2026-10-31）：其關卡計入通關數，不是「全通域」的分母。 */
export const EXTRA_STAGE_BOOKS: readonly string[] = [];
/** 關卡門檻：課文至少三題才成一關（與旅程地圖同一規則）。 */
export const STAGE_MIN_QUESTIONS = 3;

export interface LessonLite {
  id: string;
  books: string[];
  questions: number;
  /** 選文關卡（翰林／三民等自選核心選文，2026-10-30）：在地圖上、計入通關數，但不計入「全通一域」，既有玩家的全通域與文曲門檻不變。 */
  bonus?: boolean;
}

export interface RankStats {
  xp: number;
  mastered: number;
  cleared: number;
  regions: number;
  /** 題海（2026-10-31 文曲之上的階）：答對過一次的題數／題庫總題數；舊呼叫不給＝0 */
  done?: number;
  total?: number;
}

export function stagesOfBook(lessons: LessonLite[], book: string, coreOnly = false): LessonLite[] {
  return lessons.filter((l) => l.books.includes(book) && l.questions >= STAGE_MIN_QUESTIONS && (!coreOnly || !l.bonus));
}

/** 各域的關卡清單與全地圖的不重複關卡（同一課可在兩域出現，只算一關）。perRegion 只含核心關卡（全通域的分母）；all 含選文關卡（通關數的分母）。 */
export function stageSets(lessons: LessonLite[]): { all: string[]; perRegion: Record<string, string[]> } {
  const perRegion: Record<string, string[]> = {};
  const seen = new Set<string>();
  const all: string[] = [];
  for (const book of [...REGION_BOOKS, ...EXTRA_STAGE_BOOKS]) {
    const stages = stagesOfBook(lessons, book);
    if ((REGION_BOOKS as readonly string[]).includes(book)) perRegion[book] = stages.filter((l) => !l.bonus).map((l) => l.id);
    for (const l of stages) {
      if (!seen.has(l.id)) {
        seen.add(l.id);
        all.push(l.id);
      }
    }
  }
  return { all, perRegion };
}

/** 通關關數與全通域數。starsOf 回該關的星數（0–3）。 */
export function clearedStats(starsOf: (stageId: string) => number, lessons: LessonLite[]): { cleared: number; regions: number; stars: number; total: number } {
  const sets = stageSets(lessons);
  let cleared = 0;
  let stars = 0;
  for (const id of sets.all) {
    const s = starsOf(id);
    stars += s;
    if (s >= 3) cleared++;
  }
  let regions = 0;
  for (const book of REGION_BOOKS) {
    const ids = sets.perRegion[book];
    if (ids.length && ids.every((id) => starsOf(id) >= 3)) regions++;
  }
  return { cleared, regions, stars, total: sets.all.length };
}

/** 收服數：每張書靈淨答對（答對數－答錯數的一半）三次以上。與前端 cardLevel ≥ 3 同一規則。 */
export function masteredFromTallies(tallies: { ok: number; bad: number }[]): number {
  let n = 0;
  for (const t of tallies) if (t.ok - Math.floor(t.bad / 2) >= 3) n++;
  return n;
}

/** 同一範圍同一天重複出陣的學力倍率：第 1 次全額，第 2 次一半，第 3 次四分之一，之後一成。收服與星數不受影響。 */
export function repeatMultiplier(prior: number): number {
  return prior <= 0 ? 1 : prior === 1 ? 0.5 : prior === 2 ? 0.25 : 0.1;
}

export function creditXp(score: number, prior: number): number {
  return Math.round(score * repeatMultiplier(prior));
}

/** 按題遞減的模式（2026-11-26）：出陣（free）、復仇／溫習（wrong）與闖關（lesson；站長同日追加）不按「同範圍今日第幾局」打折，
 * 改成「同一題今天第幾次答對」：今天還沒答對過的題全額，同一題第二次答對起按 repeatMultiplier 遞減。
 * 只有今日試煉（daily，全站同題、排行只計首戰）仍按局數遞減。 */
export function perQuestionMode(mode: string): boolean {
  return mode === "free" || mode === "wrong" || mode === "lesson";
}

/** 按題入帳：prior(q)＝這一題今天之前已答對幾次；本局內重複出現的同一題也會遞增。答錯（0 分）不計次。 */
export function creditByQuestion(items: readonly { q: string; score: number }[], prior: (q: string) => number): { credited: number; repeated: number } {
  const seen = new Map<string, number>();
  let credited = 0;
  let repeated = 0;
  for (const it of items) {
    if (!(it.score > 0)) continue;
    const n = prior(it.q) + (seen.get(it.q) || 0);
    if (n > 0) repeated++;
    credited += Math.round(it.score * repeatMultiplier(n));
    seen.set(it.q, (seen.get(it.q) || 0) + 1);
  }
  return { credited, repeated };
}

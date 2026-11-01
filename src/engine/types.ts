/** 書靈 · 核心型別。一張「書靈卡」＝一位作家、一部作品（將來還有意象、術語、制度）；每張卡掛著若干道由已登記來源的事實生成的題。引擎自書靈（4b6013c）分出。 */

export type Tier = "N" | "R" | "SR" | "SSR";
/** who 作者／得主辨識、work 作品、line 名句溯源、era 時代、kw 授獎辭、lang 寫作語言、year 獲獎年份、exam 真題 */
export type QType = "who" | "work" | "line" | "era" | "kw" | "lang" | "year" | "exam";

export interface Book {
  id: string;
  label: string;
  glyph: string;
  region: "zh" | "world";
  stage: string;
  cards: number;
  questions: number;
}

export interface Lesson {
  /** 選文關卡（見 rank.ts LessonLite.bonus） */
  bonus?: boolean;
  /** 真題試卷關（龍門貢院） */
  exam?: boolean;
  id: string;
  title: string;
  author: string;
  books: string[];
  questions: number;
}

export interface CardMeta {
  id: string;
  w: string;
  key: string;
  py: string;
  kind: "person" | "work";
  /** 臺灣通行譯名（與 w 不同時才有） */
  alt?: string;
  tier: Tier;
  score: number;
  senses: string[];
  lists: string[];
  books: string[];
  regions: string[];
  sw: { bu: string; text: string; note: string } | null;
  dictUrl: string;
  n: number;
}

/** [id, cardIndex, typeCode, chunk, booksMask, diff100, lessonId] */
export type QIndex = [string, number, number, string, number, number, string];

export interface BankMeta {
  builtAt: string;
  edition: string;
  v: string;
  books: Book[];
  lessons: Lesson[];
  cards: CardMeta[];
  qi: QIndex[];
  stats: Record<string, unknown>;
}

export interface Source {
  label: string;
  url?: string;
  role: string;
  note?: string;
}

export interface Question {
  id: string;
  c: string;
  t: QType;
  stem: string;
  s: string;
  opts: string[]; // opts[0] is always the correct one (shuffle at render time)
  why: string;
  src: { label: string; title: string; book: string; author?: string; year?: number };
  sources: Source[];
  diff: number;
  region: string;
  book: string;
}

export const TYPE_NAMES: Record<number, QType> = { 0: "who", 1: "work", 2: "line", 3: "era", 4: "kw", 5: "lang", 6: "year", 7: "exam" };
export const TYPE_LABEL: Record<QType, string> = { who: "辨識", work: "作品", line: "名句", era: "時代", kw: "授獎辭", lang: "語言", year: "年份", exam: "真題" };
export const TIER_LABEL: Record<Tier, string> = { N: "常見", R: "稀有", SR: "史詩", SSR: "傳說" };

export type RunMode = "daily" | "free" | "wrong" | "lesson";

export interface RunAnswer {
  q: string;
  pick: string; // option text chosen ("" when timed out)
  ms: number;
  correct: boolean;
  score: number;
  combo: number;
}

export interface RunSummary {
  mode: RunMode;
  seed: string;
  scope: string;
  startedAt: number;
  finishedAt: number;
  answers: RunAnswer[];
  score: number;
  correct: number;
  total: number;
  maxCombo: number;
  newCards: string[];
  lost: boolean; // 燭火燃盡敗退
}

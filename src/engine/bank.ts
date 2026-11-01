import version from "../data/bank-version.json";
import type { BankMeta, Book, CardMeta, QIndex, Question } from "./types";

/** 題庫 meta 在啟動時從 /bank/meta.<v>.json 載入（內容雜湊命名、長期快取），不塞進 JS 包。 */
export let bank: BankMeta = { builtAt: "", edition: "", v: version.v, books: [], lessons: [], cards: [], qi: [], stats: {} };
export const cardById = new Map<string, CardMeta>();
export const bookById = new Map<string, Book>();
export const qIndexById = new Map<string, QIndex>();
export const BOOK_BIT: Record<string, number> = {};
export let ALL_MASK = 0;

export async function initBank(): Promise<BankMeta> {
  if (bank.cards.length) return bank;
  const r = await fetch(`/bank/meta.${version.v}.json`, { cache: "force-cache" });
  if (!r.ok) throw new Error(`bank meta ${r.status}`);
  const meta = (await r.json()) as BankMeta;
  bank = meta;
  for (const c of meta.cards) cardById.set(c.id, c);
  for (const b of meta.books) bookById.set(b.id, b);
  for (const q of meta.qi) qIndexById.set(q[0], q);
  meta.books.forEach((b, i) => {
    BOOK_BIT[b.id] = 1 << i;
  });
  ALL_MASK = meta.books.reduce((m, _b, i) => m | (1 << i), 0);
  return meta;
}

export function cardOfIndex(qi: QIndex): CardMeta {
  return bank.cards[qi[1]];
}

const chunkCache = new Map<string, Promise<Map<string, Question>>>();

function chunkUrl(book: string): string {
  return `/bank/${book}.${bank.v}.json`;
}

export function loadChunk(book: string): Promise<Map<string, Question>> {
  let p = chunkCache.get(book);
  if (!p) {
    p = fetch(chunkUrl(book), { cache: "force-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`chunk ${book} ${r.status}`);
        return r.json() as Promise<{ q: Question[] }>;
      })
      .then((d) => new Map(d.q.map((q) => [q.id, q])));
    chunkCache.set(book, p);
  }
  return p;
}

/** 依題目 id 取回完整題目（自動載入所需分片）。 */
export async function getQuestions(ids: string[]): Promise<Question[]> {
  const chunks = new Set<string>();
  for (const id of ids) {
    const qi = qIndexById.get(id);
    if (qi) chunks.add(qi[3]);
  }
  const maps = await Promise.all([...chunks].map((c) => loadChunk(c)));
  const out: Question[] = [];
  for (const id of ids) {
    for (const m of maps) {
      const q = m.get(id);
      if (q) {
        out.push(q);
        break;
      }
    }
  }
  return out;
}

export function prefetchChunks(books: string[]): void {
  for (const b of books) void loadChunk(b).catch(() => undefined);
}

let lessonQ: Map<string, string[]> | null = null;
/** 每課的題目 id（題海：關卡卡片與「我的」頁顯示該關答對過幾題）。題庫載入後才建，之後不變。 */
export function questionIdsByLesson(): Map<string, string[]> {
  if (!lessonQ || lessonQ.size === 0) {
    lessonQ = new Map();
    for (const q of bank.qi) {
      let a = lessonQ.get(q[6]);
      if (!a) lessonQ.set(q[6], (a = []));
      a.push(q[0]);
    }
  }
  return lessonQ;
}

export function allQuestionIds(): string[] {
  return bank.qi.map((q) => q[0]);
}

export function questionsOfCard(cardId: string): QIndex[] {
  const idx = bank.cards.findIndex((c) => c.id === cardId);
  return bank.qi.filter((q) => q[1] === idx);
}

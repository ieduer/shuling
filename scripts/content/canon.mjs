// 核心經典表（data/curated/canon/<冊>.mjs）→ 卡與事實。雲山詩國另由 poetry.mjs 處理，諾貝爾星河另由 nobel.mjs 處理。
// 核對：課本篇目與文論引文逐字對課本原文；世界文學作品的作者、成書年代與人物以 Wikidata 快照核對（data/raw/wikidata/canon.json）。
// 找不到 Wikidata 實體的條目照收，列入報告（只靠編輯表）。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { norm, excerpt, titleKey } from "./poetry.mjs";

const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);
export const CANON_BOOKS = ["wen", "shuo", "xin", "aegean", "rome", "east", "europe", "c19", "modern", "fusang", "schools"];
export const WORLD = new Set(["aegean", "rome", "east", "europe", "c19", "modern", "fusang"]);
// 成書世紀只對古典到十八世紀的冊出題（十九、二十世紀的作品都在同一世紀，問了沒有分辨力）
const CENTURY_BOOKS = { aegean: 1800, rome: 1800, east: 1800, europe: 1800, fusang: 1868 };
// 現當代中文單篇（詩、散文、短篇）用〈〉，其餘用《》
const XIN_SHORT = new Set("狂人日记 故乡 祝福 药 背影 荷塘月色 再别康桥 死水 雨巷 大堰河——我的保姆 我爱这土地 故都的秋 荷花淀 受戒 我与地坛 面朝大海，春暖花开 回答 致橡树 一代人 一杆「称仔」 送报伕 乡愁 边界望乡 错误 儿子的大玩偶 小二黑结婚 原乡人".split(" "));
export const COUNTRY_TW = { 意大利: "義大利", 尼日利亞: "奈及利亞" };
const yearOf = (t) => (t ? parseInt(t.slice(0, 1) + t.slice(1).split("-")[0], 10) : null);
export const centuryLabel = (y) => (y < 0 ? `公元前${Math.ceil(-y / 100)}世紀` : `${Math.floor((y - 1) / 100) + 1}世紀`);

export async function loadCanon(root, problems, nobelCards) {
  const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
  const wd = rd("data/raw/wikidata/canon.json");
  const recite = [...rd("data/raw/recite/recite-ms.json").pieces, ...rd("data/raw/recite/recite-gk.json").pieces];
  const reciteWen = recite.filter((p) => p.kind === "wen").map((p) => ({ title: p.title, author: p.author, text: p.paras.map((x) => x.text).join(""), gk: false }));
  const gkTitles = new Set(rd("data/raw/recite/recite-gk.json").pieces.map((p) => p.title));
  const nobelByName = new Map(nobelCards.map((c) => [c.name, c]));
  const cards = [];
  const stats = { wikidataPeople: 0, wikidataWorks: 0, editorialWorks: 0, charsConfirmed: 0, charsEditorial: 0 };

  for (const book of CANON_BOOKS) {
    const M = (await import(path.join(root, `data/curated/canon/${book}.mjs`))).default;
    if (M.book !== book) problems.push(`CANON-BOOK-MISMATCH ${book} ${M.book}`);
    const world = WORLD.has(book);
    const people = M.people || [];
    const byId = new Map(people.filter((p) => p.id).map((p) => [p.id, p]));
    const nameOfBy = (by) => (byId.get(by)?.name ? byId.get(by).name : by);
    const altOfBy = (by) => byId.get(by)?.tw || nobelByName.get(by)?.alt || "";
    const src = world ? ["curated-canon", "wikidata-canon"] : ["curated-canon"];

    // ── 作品 ──
    const works = [];
    for (const w of M.works || []) {
      const rec = w.id ? wd.works[`${book}:${w.id}`] : null;
      if (world) rec ? stats.wikidataWorks++ : stats.editorialWorks++;
      const author = w.by ? nameOfBy(w.by) : "";
      if (w.by && !byId.has(w.by) && !nobelByName.has(w.by) && world) problems.push(`CANON-AUTHOR-UNKNOWN ${book}:${w.id || w.name} ${w.by}`);
      const year = rec ? yearOf(rec.P577[0] || rec.P571[0]) : null;
      const short = (book === "xin" && XIN_SHORT.has(w.name)) || (book === "shuo" && w.dyn === "唐");
      works.push({ ...w, author, authorAlt: w.by ? altOfBy(w.by) : "", rec, year, short, chars: (w.chars || []).map((c) => (Array.isArray(c) ? c : [c, ""])) });
    }
    // 文淵：課本篇目（逐字核對名句）與典籍
    if (book === "wen") {
      for (const [title, t] of Object.entries(M.textbook)) {
        const piece = reciteWen.find((p) => p.title === title);
        if (!piece) {
          problems.push(`CANON-TEXTBOOK-MISSING wen ${title}`);
          continue;
        }
        const lines = [];
        for (const l of t.lines) {
          const ex = excerpt(piece.text, l);
          if (!ex) problems.push(`CANON-LINE-NOT-IN-TEXT wen ${title} ${l}`);
          else lines.push(ex);
        }
        if (t.book) {
          const b = M.books.find((x) => x.name === t.book);
          if (!b) problems.push(`CANON-TEXTBOOK-BOOK-MISSING ${title} ${t.book}`);
          else (b.excerptLines ||= []).push(...lines.map((line) => ({ line, piece: title })));
          continue;
        }
        works.push({ name: title, author: t.by || "", src: t.src || "", lines, chars: [], textbook: true, gk: gkTitles.has(title), short: true });
      }
      for (const b of M.books) works.push({ name: b.name, author: b.by || "", genre: "", tiGenre: b.genre || "", school: b.school || "", fame: b.fame || [], lines: [], excerptLines: b.excerptLines || [], chars: [], isBook: true });
    }
    // 題名重複（本冊內）
    const seen = new Map();
    for (const w of works) seen.set(norm(w.name), (seen.get(norm(w.name)) || 0) + 1);
    for (const [k, n] of seen) if (n > 1) problems.push(`CANON-DUP-TITLE ${book} ${k}`);

    for (const w of works) {
      const facts = [];
      const S = [...src];
      if (w.textbook) S.push(w.gk ? "recite-gk" : "recite-ms");
      if (w.author) facts.push({ p: "work_author", o: w.author, alt: w.authorAlt, src: S });
      if (w.src) facts.push({ p: "work_src", o: w.src, src: S });
      for (const [zh, en] of w.chars) {
        const ok = w.rec?.chars ? w.rec.chars[zh] : undefined;
        if (ok) stats.charsConfirmed++;
        else stats.charsEditorial++;
        facts.push({ p: "work_char", o: zh, en, wd: !!ok, src: S });
      }
      for (const l of w.lines || []) facts.push({ p: "work_line", o: l, src: S });
      for (const x of w.excerptLines || []) facts.push({ p: "work_line", o: x.line, piece: x.piece, src: [...S, "recite-ms", "recite-gk"] });
      for (const f of w.fame || []) facts.push({ p: "work_fame", o: f, src: S });
      if (w.genre) facts.push({ p: "work_genre", o: w.genre, src: S });
      if (w.tiGenre) facts.push({ p: "book_genre", o: w.tiGenre, src: S });
      if (w.school) facts.push({ p: "book_school", o: w.school, src: S });
      if (w.country) facts.push({ p: "work_country", o: w.country, src: S });
      if (w.dyn) facts.push({ p: "work_dyn", o: w.dyn, src: S });
      if (CENTURY_BOOKS[book] && w.year && w.year < CENTURY_BOOKS[book]) facts.push({ p: "work_century", o: centuryLabel(w.year), year: w.year, src: ["wikidata-canon"] });
      const id = `cw-${book}-${h(w.id || w.name)}`;
      w.cardId = id;
      cards.push({ id, book, kind: "work", name: w.name, alt: w.tw || "", en: w.en || w.rec?.labels?.en || "", author: w.author, authorAlt: w.authorAlt, dyn: w.dyn || "", country: w.country || "", year: w.year, short: !!w.short, isBook: !!w.isBook, textbook: !!w.textbook, gk: !!w.gk, generic: !!w.generic, qid: w.rec?.qid || "", url: w.rec?.qid ? `https://www.wikidata.org/wiki/${w.rec.qid}` : "", prominence: w.rec?.sitelinks ?? (w.textbook ? (w.gk ? 60 : 50) : w.isBook ? 50 : 30), facts, srcIds: S });
    }

    // ── 人物 ──
    for (const p of people) {
      const rec = p.id ? wd.people[`${book}:${p.id}`] : null;
      if (rec) stats.wikidataPeople++;
      const mine = works.filter((w) => w.author === p.name);
      const facts = [];
      for (const a of p.aka || []) facts.push({ p: "person_aka", o: a, src });
      for (const w of mine.slice(0, 3)) facts.push({ p: "person_work", o: w.name, src });
      if (p.country) facts.push({ p: "person_country", o: p.country, src });
      if (p.genre) facts.push({ p: "person_genre", o: p.genre, src });
      for (const l of p.lines || []) facts.push({ p: "person_line", o: l, src });
      if (p.era) facts.push({ p: "person_era", o: p.era, src });
      const id = `cp-${book}-${h(p.id || p.name)}`;
      if (facts.length < 2) {
        problems.push(`CANON-PERSON-FOLDED ${book}:${p.id || p.name} (${facts.length} fact)`);
        continue;
      }
      cards.push({ id, book, kind: "person", name: p.name, alt: p.tw || "", en: p.en || "", country: p.country || "", era: p.era || "", qid: rec?.qid || "", url: rec?.qid ? `https://www.wikidata.org/wiki/${rec.qid}` : "", prominence: rec?.sitelinks ?? 30 + mine.length * 10 + (p.aka || []).length * 5, facts, works: mine.map((w) => w.name), srcIds: src });
    }

    // ── 並稱、流派 ──
    for (const g of M.groups || []) {
      if ((g.pool || []).filter((x) => !g.members.includes(x)).length < 3) problems.push(`CANON-GROUP-POOL-SHORT ${book} ${g.name}`);
      cards.push({ id: `cg-${book}-${h(g.name)}`, book, kind: "group", name: g.name, groupKind: g.kind, members: g.members, pool: g.pool, prominence: 40 + g.members.length * 3, facts: g.members.map((m) => ({ p: "group_member", o: m, src: ["curated-canon"] })), srcIds: ["curated-canon"] });
    }

    // ── 文論與文體 ──
    for (const t of M.terms || []) {
      const facts = [];
      if (t.by) facts.push({ p: "term_by", o: t.by, src: ["curated-canon"] });
      if (t.in) facts.push({ p: "term_in", o: t.in, src: ["curated-canon"] });
      if (t.gist) facts.push({ p: "term_gist", o: t.gist, src: ["curated-canon"] });
      if (t.ex) facts.push({ p: "term_example", o: t.ex, src: ["curated-canon"] });
      for (const q of t.quote || []) {
        const piece = reciteWen.find((p) => excerpt(p.text, q));
        if (!piece) problems.push(`CANON-QUOTE-NOT-IN-TEXT ${t.name} ${q}`);
        else facts.push({ p: "term_quote", o: excerpt(piece.text, q), piece: piece.title, src: ["curated-canon", gkTitles.has(piece.title) ? "recite-gk" : "recite-ms"] });
      }
      if (facts.length < 2) problems.push(`CANON-TERM-THIN ${t.name}`);
      cards.push({ id: `ct-${book}-${h(t.name)}`, book, kind: "term", name: t.name, termKind: t.kind || "theory", by: t.by || "", in: t.in || "", prominence: t.kind === "form" ? 45 : 40, facts, srcIds: ["curated-canon"] });
    }
  }
  return { cards, stats, titleKey };
}

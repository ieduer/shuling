#!/usr/bin/env node
// 書靈題庫嚴格建置：卡＋事實 → 題目 → 與字靈引擎相容的分片（public/bank）、伺服器索引（worker/bank-index.json）、關卡表（worker/lessons.json）。
// 任何問題（未登記來源、授獎辭短語不逐字、重複題、選項不足、關卡不足三題）都讓建置失敗且不寫輸出；--loose 只用來看報告。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { SOURCES } from "./lib/sources.mjs";
import { loadNobel, PHASES } from "./content/nobel.mjs";
import { loadPoetry, ERAS, COLLECTIONS } from "./content/poetry.mjs";
import { loadWorld, WORLD_BOOKS } from "./content/world.mjs";

const root = path.resolve(new URL("../", import.meta.url).pathname);
const STRICT = !process.argv.includes("--loose");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const h = (s) => sha(s).slice(0, 12);

export const BOOKS = [
  { id: "shi", label: "雲山詩國", glyph: "詩", region: "zh", stage: "core" },
  { id: "aegean", label: WORLD_BOOKS.aegean, glyph: "希", region: "world", stage: "core" },
  { id: "rome", label: WORLD_BOOKS.rome, glyph: "羅", region: "world", stage: "core" },
  { id: "fusang", label: WORLD_BOOKS.fusang, glyph: "桑", region: "world", stage: "core" },
  { id: "nobel", label: "諾貝爾星河", glyph: "星", region: "world", stage: "core" },
  { id: "schools", label: WORLD_BOOKS.schools, glyph: "潮", region: "world", stage: "core" },
  { id: "exam", label: "真卷殿", glyph: "卷", region: "zh", stage: "core" },
];
const TYPE_CODE = { who: 0, work: 1, line: 2, era: 3, kw: 4, lang: 5, year: 6, exam: 7 };
const LESSON_MAX = 10;

const problems = [];
const sourceDigests = {};
for (const [id, s] of Object.entries(SOURCES)) {
  for (const f of s.files) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) problems.push(`SOURCE-FILE-MISSING ${id} ${f}`);
    else sourceDigests[f] = sha(fs.readFileSync(p));
  }
}
const codeDigest = sha(["scripts/build-bank.mjs", "scripts/content/nobel.mjs", "scripts/content/poetry.mjs", "scripts/content/world.mjs", "scripts/lib/sources.mjs"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n"));

const nobelLoaded = loadNobel(root, problems);
const world = loadWorld(root, problems, nobelLoaded);
// 真卷殿：指考試卷一卷一卡（只有一題的卷與下一卷合成一卡，讓每張卡至少兩題）
const examData = JSON.parse(fs.readFileSync(path.join(root, "data/raw/exams/tw-literature.json"), "utf8"));
const examCards = [];
{
  const byYear = new Map();
  for (const q of examData.questions) {
    if (!byYear.has(q.year)) byYear.set(q.year, []);
    byYear.get(q.year).push(q);
  }
  let pend = [];
  for (const y of [...byYear.keys()].sort((a, b) => a - b)) {
    pend.push(...byYear.get(y));
    if (pend.length < 2) continue;
    const labels = [...new Set(pend.map((q) => q.year_label))];
    examCards.push({ id: `ex-${pend[0].year}`, book: "exam", kind: "work", name: labels.length > 1 ? `指考 ${labels[0]}–${labels[labels.length - 1]}` : `指考 ${labels[0]}`, prominence: pend.length * 10, facts: pend.map((q) => ({ p: "exam_item", o: q.id, item: q, src: ["tw-exams"] })) });
    pend = [];
  }
  if (pend.length) problems.push(`EXAM-TAIL ${pend.map((q) => q.id).join(",")} (fewer than two items left)`);
}
const cards = [...loadPoetry(root, problems), ...world.cards, ...nobelLoaded, ...examCards];
for (const c of cards) for (const f of c.facts) for (const s of f.src) if (!SOURCES[s]) problems.push(`SOURCE-UNREGISTERED ${c.id} ${f.p} ${s}`);

// ── 題目 ───────────────────────────────────────────────────────────────
const workTitle = (t) => (/[《〈]/.test(t) ? t : `〈${t}〉`);
const bookTitle = (t) => `《${t}》`;
const rankBy = (seed, list) => [...list].sort((a, b) => (sha(seed + a) < sha(seed + b) ? -1 : 1));
function pickDistractors(qid, answer, tiers, avoid = () => false) {
  const out = [];
  for (const tier of tiers) {
    for (const cand of rankBy(qid, [...new Set(tier)])) {
      if (out.length === 3) break;
      if (!cand || cand === answer || out.includes(cand) || avoid(cand)) continue;
      out.push(cand);
    }
  }
  return out;
}
const srcList = (ids) => ids.map((id) => ({ label: SOURCES[id].label, url: SOURCES[id].url, role: SOURCES[id].role }));

const nobelCards = cards.filter((c) => c.book === "nobel");
const poemCards = cards.filter((c) => c.book === "shi" && c.kind === "work");
const poetCards = cards.filter((c) => c.book === "shi" && c.kind === "person");
const nobelLangs = [...new Set(nobelCards.flatMap((c) => c.facts.filter((f) => f.p === "writing_lang").map((f) => f.o)))];
const poemsByTitle = new Map(poemCards.map((c) => [c.name, c]));
const authorsOfEra = (era) => poetCards.filter((p) => p.era === era).map((p) => p.name);
const allAuthors = poetCards.map((p) => p.name);
const nearEras = (era) => {
  const i = ERAS.indexOf(era);
  return ERAS.filter((e, j) => e !== era && Math.abs(j - i) <= 2);
};

const questions = [];
const seenFacts = new Set();
function add(card, f, t, stem, s, answer, distractors, why, extraSources = []) {
  const qid = `q-${h(`${card.id}|${f.p}|${f.o}|${t}`)}`;
  // 同一張卡的同一條事實只出一題；不同卡若題幹、引文、正解完全相同也算重複
  for (const key of [`fact|${card.id}|${f.p}|${f.o}`, `text|${stem}|${s}|${answer}`]) {
    if (seenFacts.has(key)) problems.push(`DUP ${card.id} ${key}`);
    seenFacts.add(key);
  }
  if (distractors.length < 3) problems.push(`OPTIONS-SHORT ${qid} ${card.id} ${f.p} ${f.o} (${distractors.length})`);
  if (new Set([answer, ...distractors]).size !== 1 + distractors.length) problems.push(`OPTIONS-DUP ${qid}`);
  questions.push({ id: qid, c: card.id, t, stem, s, opts: [answer, ...distractors], why, src: { label: BOOKS.find((b) => b.id === card.book).label, title: "", book: card.book }, sources: [...srcList(f.src), ...extraSources], book: card.book, f: f.p });
}

for (const c of nobelCards) {
  const nm = c.name;
  const samePhase = nobelCards.filter((x) => x.phase.id === c.phase.id && x.year !== c.year).map((x) => x.name);
  const nearYears = nobelCards.filter((x) => Math.abs(x.year - c.year) <= 12 && x.year !== c.year).map((x) => x.name);
  const others = nobelCards.filter((x) => x.year !== c.year).map((x) => x.name);
  const wdSrc = c.url ? [{ label: "維基百科條目", url: c.url, role: "reference" }] : [];
  for (const f of c.facts) {
    if (f.p === "nobel_year") {
      const shared = nobelCards.some((x) => x.year === c.year && x.id !== c.id);
      const qid = `q-${h(`${c.id}|${f.p}|${f.o}|year`)}`;
      add(c, f, "year", `${c.year}年諾貝爾文學獎${shared ? "得主之一" : "得主"}是誰？`, "", nm, pickDistractors(qid, nm, [samePhase.filter((x) => nearYears.includes(x)), samePhase, others]), `${nm}（${c.en}），${c.year}年諾貝爾文學獎。授獎辭重點：${c.facts.find((x) => x.p === "citation_kw").label}。`, wdSrc);
    } else if (f.p === "citation_kw") {
      const qid = `q-${h(`${c.id}|${f.p}|${f.o}|kw`)}`;
      add(c, f, "kw", `授獎辭以下面這句稱述的是哪一位得主？（${f.label}）`, f.o, nm, pickDistractors(qid, nm, [samePhase, others]), `${c.year}年授獎辭寫到 “${f.o}”（${f.label}），得主是${nm}。此年屬授獎辭「${c.phase.label}」一期。`, [{ label: `${c.year}年授獎辭原文`, url: "https://www.nobelprize.org/prizes/literature/", role: "official" }]);
    } else if (f.p === "notable_work") {
      const qid = `q-${h(`${c.id}|${f.p}|${f.o}|work`)}`;
      const avoid = (cand) => nobelCards.find((x) => x.name === cand)?.facts.some((g) => g.p === "notable_work" && g.o === f.o);
      add(c, f, "work", `${bookTitle(f.o)}${f.alt ? `（臺譯${bookTitle(f.alt)}）` : ""}是哪一位諾貝爾文學獎得主的作品？`, "", nm, pickDistractors(qid, nm, [samePhase, others], avoid), `${bookTitle(f.o)}是${nm}的代表作之一（Wikidata 列為其代表作，${f.qid}）。${nm}於${c.year}年獲獎。`);
    } else if (f.p === "writing_lang") {
      const qid = `q-${h(`${c.id}|${f.p}|${f.o}|lang`)}`;
      add(c, f, "lang", `${nm}主要以哪一種語言寫作？`, "", f.o, pickDistractors(qid, f.o, [nobelLangs]), `${nm}的寫作語言是${f.o}${f.raw && f.raw !== f.o ? `（Wikidata 標為「${f.raw}」）` : "（Wikidata）"}。`);
    }
  }
}

for (const c of poemCards) {
  for (const f of c.facts) {
    if (f.p === "work_author") {
      const qid = `q-${h(`${c.id}|${f.p}|${f.o}|who`)}`;
      add(c, f, "who", `${workTitle(c.name)}的作者是誰？`, "", f.o, pickDistractors(qid, f.o, [authorsOfEra(c.era), allAuthors]), `${workTitle(c.name)}，${c.dynasty}·${c.author}。`);
    } else if (f.p === "work_collection") {
      const qid = `q-${h(`${c.id}|${f.p}|${f.o}|work`)}`;
      add(c, f, "work", `${workTitle(c.name)}出自哪一部詩集？`, "", bookTitle(f.o), pickDistractors(qid, f.o, [COLLECTIONS]).map(bookTitle), `${workTitle(c.name)}出自${bookTitle(f.o)}${c.dynasty ? `（課本標「${c.dynasty}」）` : ""}。`);
    } else if (f.p === "line_of_work") {
      const qid = `q-${h(`${c.id}|${f.p}|${f.o}|line`)}`;
      const sameAuthor = c.anon ? [] : poemCards.filter((x) => x.author === c.author && x.id !== c.id).map((x) => x.name);
      const sameEra = poemCards.filter((x) => x.era === c.era && x.id !== c.id).map((x) => x.name);
      const avoid = (cand) => poemsByTitle.get(cand)?.facts.some((g) => g.p === "line_of_work" && g.o === f.o);
      const ds = pickDistractors(qid, c.name, [sameAuthor, sameEra, poemCards.map((x) => x.name)], avoid);
      add(c, f, "line", "下面這句詩出自哪一篇？", f.o, workTitle(c.name), ds.map(workTitle), `「${f.o}」出自${c.anon ? "" : `${c.dynasty}·${c.author}`}${workTitle(c.name)}。`);
    }
  }
}

for (const c of poetCards) {
  for (const f of c.facts) {
    if (f.p === "author_era") {
      const qid = `q-${h(`${c.id}|${f.p}|${f.o}|era`)}`;
      add(c, f, "era", `${c.name}是哪一個時代的作家？`, "", f.o, pickDistractors(qid, f.o, [nearEras(f.o), ERAS]), `${c.name}，課本標為「${f.raw}」，屬${f.o}。`);
    } else if (f.p === "author_work") {
      const qid = `q-${h(`${c.id}|${f.p}|${f.o}|work`)}`;
      const otherEra = poemCards.filter((x) => x.author !== c.name && x.era === c.era).map((x) => x.name);
      const other = poemCards.filter((x) => x.author !== c.name).map((x) => x.name);
      add(c, f, "work", `下列哪一篇是${c.name}的作品？`, "", workTitle(f.o), pickDistractors(qid, f.o, [otherEra, other]).map(workTitle), `${workTitle(f.o)}是${c.name}的作品。`);
    } else if (f.p === "line_author") {
      const qid = `q-${h(`${c.id}|${f.p}|${f.o}|who`)}`;
      add(c, f, "who", "下面這句詩的作者是誰？", f.o, c.name, pickDistractors(qid, c.name, [authorsOfEra(c.era), allAuthors]), `「${f.o}」出自${c.name}${workTitle(f.work)}。`);
    }
  }
}

// 萬國星海：作者、作品、體裁、時代、流派
const worldCards = cards.filter((c) => ["aegean", "rome", "fusang", "schools"].includes(c.book));
const worldPeople = worldCards.filter((c) => c.kind === "person");
const workAuthor = new Map();
for (const c of worldCards) {
  if (c.kind === "work") workAuthor.set(c.name, c.author);
  for (const f of c.facts) if (f.p === "author_work") workAuthor.set(f.o, c.name);
}
const allWorks = [...workAuthor.keys()];
// 體裁干擾項先取同一冊出現過的體裁（希臘悲劇配史詩、喜劇；物語配隨筆、和歌），不夠再取全部
const genresOfBook = (book) => [...new Set(worldCards.filter((x) => x.book === book).flatMap((x) => x.facts.filter((f) => f.p === "work_genre" || f.p === "author_genre").map((f) => f.o)))];
const BOOK_FAMILY = { aegean: ["aegean", "rome"], rome: ["aegean", "rome"], fusang: ["fusang"] };
const neighbours = (label, kind) => {
  if (kind === "decade") {
    const y = parseInt(label, 10);
    return [-30, -20, -10, 10, 20, 30].map((d) => `${y + d}年代`);
  }
  const m = label.match(/^(公元前)?(\d+)世紀$/);
  const n = m[1] ? -parseInt(m[2], 10) : parseInt(m[2], 10);
  return [-3, -2, -1, 1, 2, 3].map((d) => n + d).filter((x) => x !== 0).map((x) => (x < 0 ? `公元前${-x}世紀` : `${x}世紀`));
};
for (const c of worldCards) {
  const sameBookPeople = worldPeople.filter((p) => p.book === c.book && p.id !== c.id).map((p) => p.name);
  for (const f of c.facts) {
    const qid = `q-${h(`${c.id}|${f.p}|${f.o}`)}`;
    if (f.p === "work_author") add(c, f, "who", `${bookTitle(c.name)}${c.alt ? `（臺譯${bookTitle(c.alt)}）` : ""}的作者是誰？`, "", f.o, pickDistractors(qid, f.o, [sameBookPeople, worldPeople.map((p) => p.name), world.allPeople]), `${bookTitle(c.name)}的作者是${f.o}（Wikidata）。`);
    else if (f.p === "work_genre") add(c, f, "work", `${bookTitle(c.name)}屬於哪一種體裁？`, "", f.o, pickDistractors(qid, f.o, [(BOOK_FAMILY[c.book] || []).flatMap(genresOfBook), world.genres]), `${bookTitle(c.name)}是${f.o}（Wikidata 體裁）。`);
    else if (f.p === "work_decade") add(c, f, "era", `${bookTitle(c.name)}首次出版於哪一個年代？`, "", f.o, pickDistractors(qid, f.o, [neighbours(f.o, "decade")]), `${bookTitle(c.name)}出版於${f.o}（Wikidata 出版日期）。`);
    else if (f.p === "work_century") add(c, f, "era", `${bookTitle(c.name)}成書於哪一個世紀？`, "", f.o, pickDistractors(qid, f.o, [neighbours(f.o, "century")]), `${bookTitle(c.name)}成書於${f.o}（Wikidata 成立時間）。`);
    else if (f.p === "author_work") {
      const avoid = (cand) => workAuthor.get(cand) === c.name;
      const sameBook = allWorks.filter((w) => worldCards.some((x) => x.book === c.book && (x.name === workAuthor.get(w) || x.name === w)));
      add(c, f, "work", `下列哪一部是${c.name}的作品？`, "", bookTitle(f.o), pickDistractors(qid, f.o, [sameBook, allWorks], avoid).map(bookTitle), `${bookTitle(f.o)}${f.alt ? `（臺譯${bookTitle(f.alt)}）` : ""}是${c.name}的作品（Wikidata 作者）。`);
    } else if (f.p === "birth_century") add(c, f, "era", `${c.name}生於哪一個世紀？`, "", f.o, pickDistractors(qid, f.o, [neighbours(f.o, "century")]), `${c.name}生於${f.o}（Wikidata 出生日期）。`);
    else if (f.p === "author_genre") add(c, f, "work", `${c.name}以哪一種體裁著稱？`, "", f.o, pickDistractors(qid, f.o, [(BOOK_FAMILY[c.book] || []).flatMap(genresOfBook), world.genres]), `${c.name}的代表體裁是${f.o}（Wikidata）。`);
    else if (f.p === "movement_member") add(c, f, "who", `下列哪一位被歸入${c.name}${c.alt ? `（臺稱${c.alt}）` : ""}？`, "", f.o, pickDistractors(qid, f.o, [c.distractorPool.filter((p) => !c.memberSet.has(p))]), `Wikidata 把${f.o}歸入${c.name}。`);
  }
}

for (const c of examCards) {
  for (const f of c.facts) {
    const q = f.item;
    const ans = q.options.find((o) => o.key === q.answer);
    if (!ans) {
      problems.push(`EXAM-ANSWER-MISSING ${q.id}`);
      continue;
    }
    add(c, f, "exam", q.stem, q.passage, ans.text, q.options.filter((o) => o.key !== q.answer).map((o) => o.text), `指考${q.year_label}第 ${q.q_num} 題，官方答案（${q.answer}）：${ans.text}。`, q.answer_source ? [{ label: "官方答案原檔", url: q.answer_source, role: "official" }] : []);
  }
}

// 人名選項並列臺灣譯名（加繆（卡繆）），兩岸讀者都認得；題幹與解析不動
const altOf = new Map(cards.filter((c) => c.kind === "person" && c.alt).map((c) => [c.name, c.alt]));
for (const q of questions) {
  if (q.t === "who" || q.t === "year" || q.t === "kw") q.opts = q.opts.map((o) => (altOf.has(o) ? `${o}（${altOf.get(o)}）` : o));
}

// ── 稀有度（各冊內按分數分位：SSR 6%、SR 10%、R 20%、其餘 N） ──────────────
function scoreOf(c) {
  if (c.book === "nobel" || c.prominence !== undefined) return c.prominence ?? 100;
  if (c.kind === "work") return (c.inGk ? 2 : 0) + (c.inMs ? 1 : 0) + (c.inAnth ? 0.5 : 0) + Math.min(poetCards.find((p) => p.name === c.author)?.works || 0, 10) * 0.2;
  return c.works * 1.5 + (c.gkWorks || 0);
}
for (const b of BOOKS) {
  const list = cards.filter((c) => c.book === b.id).sort((a, z) => scoreOf(z) - scoreOf(a) || (a.id < z.id ? -1 : 1));
  list.forEach((c, i) => {
    const q = i / list.length;
    c.tier = q < 0.06 ? "SSR" : q < 0.16 ? "SR" : q < 0.36 ? "R" : "N";
    c.score = Math.round(scoreOf(c) * 100) / 100;
  });
}

// ── 關卡：星河按授獎辭五期、依年份每 10 張卡一關；詩國不按時代分關（關名一露時代，時代題就洩題），以卡號雜湊混編。
// 關名不帶時代或年份區間，理由同上。
const lessons = [];
const lessonOfCard = new Map();
for (const b of BOOKS) {
  const groups = new Map();
  const mixed = b.id !== "nobel";
  const ordered = cards.filter((x) => x.book === b.id).sort(mixed ? (a, z) => (sha(`stage|${a.id}`) < sha(`stage|${z.id}`) ? -1 : 1) : (a, z) => a.order - z.order || (a.year || 0) - (z.year || 0) || (a.id < z.id ? -1 : 1));
  for (const c of ordered) {
    const g = mixed ? b.id : c.group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  }
  for (const [g, list] of groups) {
    const n = Math.ceil(list.length / LESSON_MAX);
    const size = Math.ceil(list.length / n);
    for (let i = 0; i < n; i++) {
      const part = list.slice(i * size, (i + 1) * size);
      const id = `L-${h(`${b.id}|${g}|${i}`).slice(0, 8)}`;
      const NUM = "一二三四五六七八九十";
      const title = b.id === "nobel" ? `${PHASES.find((p) => p.id === g).label}·${NUM[i]}` : `${b.id === "shi" ? "詩國" : b.label}·${NUM[i] || i + 1}`;
      lessons.push({ id, title, author: "", books: [b.id], questions: 0 });
      for (const c of part) lessonOfCard.set(c.id, id);
    }
  }
}
for (const q of questions) {
  const l = lessons.find((x) => x.id === lessonOfCard.get(q.c));
  q.lesson = l.id;
  q.src.title = l.title;
  l.questions += 1;
}
for (const l of lessons) if (l.questions < 3) problems.push(`LESSON-TOO-SMALL ${l.id} ${l.title} ${l.questions}`);
for (const c of cards) {
  const facts = new Set(questions.filter((q) => q.c === c.id).map((q) => `${q.f}|${q.stem}|${q.s}|${q.opts[0]}`));
  if (facts.size < 2) problems.push(`CARD-ONE-FACT ${c.id} ${c.name} (${[...facts].join(",") || "none"})`);
}

// ── 輸出 ───────────────────────────────────────────────────────────────
// 報告類（官方資料錯配、作品併入作者卡、事實不足兩條而未成卡）不擋建置，列在 BUILD-REPORT
const WARN = ["NOBEL-WIKIDATA-MISMATCH", "WORLD-WIKIDATA", "WORLD-WORK-FOLDED", "WORLD-WORK-DROPPED", "WORLD-PERSON-DROPPED", "POETRY-ANTH-FOLDED", "EXAM-TAIL"];
const blocking = problems.filter((p) => !WARN.some((w) => p.startsWith(w)));
const report = { builtAt: new Date().toISOString().slice(0, 10), sources: sourceDigests, codeDigest, problems };
fs.writeFileSync(path.join(root, "data/BUILD-REPORT.json"), JSON.stringify(report, null, 1) + "\n");
if (STRICT && blocking.length) {
  for (const p of blocking.slice(0, 120)) console.error(p);
  console.error(`BUILD FAILED: ${blocking.length} problems (nothing written)`);
  process.exit(1);
}

const v = h(JSON.stringify(sourceDigests) + codeDigest);
const cardList = cards.map((c) => {
  const qs = questions.filter((q) => q.c === c.id);
  const isNobel = c.book === "nobel";
  const isWorld = ["aegean", "rome", "fusang", "schools"].includes(c.book);
  const kw = c.facts.find((f) => f.p === "citation_kw");
  const work = c.facts.find((f) => f.p === "notable_work");
  return {
    id: c.id,
    w: c.name,
    key: [c.name, c.alt, c.en, c.author].filter(Boolean).join(" "),
    py: c.book === "exam" ? `${c.facts.length} 題` : isNobel ? `${c.year} · ${c.langs.join("／") || c.en}` : isWorld ? (c.kind === "term" ? `${c.facts.length} 位作家` : c.en) : c.kind === "work" ? `${c.dynasty}${c.anon ? "" : ` · ${c.author}`}` : c.dynasties.join("、"),
    kind: c.kind,
    tier: c.tier,
    score: c.score,
    senses: c.book === "exam" ? [...new Set(c.facts.map((f) => f.item.category))] : isNobel ? [kw.label, ...(work ? [bookTitle(work.o)] : [])] : isWorld ? c.facts.filter((f) => ["author_work", "work_genre", "author_genre", "movement_member"].includes(f.p)).map((f) => (f.p === "author_work" ? bookTitle(f.o) : f.o)) : c.kind === "work" ? c.facts.filter((f) => f.p === "line_of_work").map((f) => f.o) : c.facts.filter((f) => f.p === "author_work").map((f) => workTitle(f.o)),
    lists: c.book === "exam" ? ["真卷殿"] : isNobel ? [`授獎辭·${c.phase.label}`] : isWorld ? [BOOKS.find((b) => b.id === c.book).label] : [c.era],
    books: [c.book],
    regions: [BOOKS.find((b) => b.id === c.book).region],
    sw: null,
    dictUrl: isNobel ? c.url : "",
    alt: c.alt || "",
    n: qs.length,
  };
});
const cardIndex = new Map(cardList.map((c, i) => [c.id, i]));
const bookBit = Object.fromEntries(BOOKS.map((b, i) => [b.id, 1 << i]));
const qi = questions.map((q) => [q.id, cardIndex.get(q.c), TYPE_CODE[q.t], q.book, bookBit[q.book], 50, q.lesson]);
const typeCount = Object.fromEntries(Object.keys(TYPE_CODE).map((t) => [t, questions.filter((q) => q.t === t).length]));
const books = BOOKS.map((b) => ({ ...b, cards: cards.filter((c) => c.book === b.id).length, questions: questions.filter((q) => q.book === b.id).length }));
const stats = { cards: cards.length, questions: questions.length, lessons: lessons.length, byType: typeCount, byBook: Object.fromEntries(books.map((b) => [b.id, { cards: b.cards, questions: b.questions }])) };
const meta = { builtAt: report.builtAt, edition: "書靈 P1 首批", v, books, lessons, cards: cardList, qi, stats };

const chunkDir = path.join(root, "public/bank");
fs.rmSync(chunkDir, { recursive: true, force: true });
fs.mkdirSync(chunkDir, { recursive: true });
fs.writeFileSync(path.join(chunkDir, `meta.${v}.json`), JSON.stringify(meta) + "\n");
for (const b of BOOKS) {
  const qs = questions.filter((q) => q.book === b.id).map((q) => ({ id: q.id, c: q.c, t: q.t, stem: q.stem, s: q.s, opts: q.opts, why: q.why, src: q.src, sources: q.sources, diff: 0.5, region: b.region, book: q.book }));
  fs.writeFileSync(path.join(chunkDir, `${b.id}.${v}.json`), JSON.stringify({ v, book: b.id, q: qs }) + "\n");
}
fs.mkdirSync(path.join(root, "src/data"), { recursive: true });
fs.writeFileSync(path.join(root, "src/data/bank-version.json"), JSON.stringify({ v, builtAt: meta.builtAt, questions: questions.length, cards: cardList.length }) + "\n");
const tierOf = new Map(cardList.map((c) => [c.id, c.tier]));
fs.writeFileSync(path.join(root, "worker/bank-index.json"), JSON.stringify({ version: v, q: Object.fromEntries(questions.map((q) => [q.id, { c: q.c, a: sha(q.opts[0]).slice(0, 16), t: q.t, r: tierOf.get(q.c) }])) }) + "\n");
fs.writeFileSync(path.join(root, "worker/lessons.json"), JSON.stringify({ v, lessons: lessons.map((l) => ({ id: l.id, books: l.books, questions: l.questions })) }) + "\n");
console.log(JSON.stringify({ v, ...stats, warnings: problems.length - blocking.length }));

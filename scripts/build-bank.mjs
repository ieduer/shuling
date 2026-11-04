#!/usr/bin/env node
// 書靈嚴格建置（核心經典版）：卡＋事實 → 題目 → 分片（public/bank）、伺服器索引（worker/bank-index.json）、關卡表（worker/lessons.json）。
// 題庫只收文學最關鍵的知識：名篇名句、作家與代表作、人物、稱號、並稱流派、文論與文體、諾貝爾得主、真題。
// 任何問題（未登記來源、名句不在原文、授獎辭短語不逐字、重複題、選項不足、關卡不足三題）都讓建置失敗且不寫輸出；--loose 只用來看報告。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { SOURCES } from "./lib/sources.mjs";
import { loadNobel, PHASES } from "./content/nobel.mjs";
import { loadPoetry, ERAS, COLLECTIONS, SHIJING_PARTS, norm, titleKey } from "./content/poetry.mjs";
import { loadCanon, COUNTRY_TW } from "./content/canon.mjs";

const root = path.resolve(new URL("../", import.meta.url).pathname);
const STRICT = !process.argv.includes("--loose");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const h = (s) => sha(s).slice(0, 12);

export const BOOKS = [
  { id: "shi", label: "雲山詩國", glyph: "詩", region: "zh", stage: "core" },
  { id: "wen", label: "文淵", glyph: "文", region: "zh", stage: "core" },
  { id: "shuo", label: "說部梨園", glyph: "說", region: "zh", stage: "core" },
  { id: "xin", label: "新潮碼頭", glyph: "新", region: "zh", stage: "core" },
  { id: "aegean", label: "愛琴海", glyph: "希", region: "world", stage: "core" },
  { id: "rome", label: "七丘", glyph: "羅", region: "world", stage: "core" },
  { id: "east", label: "新月與恆河", glyph: "東", region: "world", stage: "core" },
  { id: "europe", label: "聖殿長廊", glyph: "歐", region: "world", stage: "core" },
  { id: "c19", label: "浪漫與寫實", glyph: "實", region: "world", stage: "core" },
  { id: "modern", label: "現代迷城", glyph: "今", region: "world", stage: "core" },
  { id: "fusang", label: "扶桑", glyph: "桑", region: "world", stage: "core" },
  { id: "nobel", label: "諾貝爾星河", glyph: "星", region: "world", stage: "core" },
  { id: "schools", label: "思潮館", glyph: "潮", region: "world", stage: "core" },
  { id: "exam", label: "真卷殿", glyph: "卷", region: "zh", stage: "core" },
];
const TYPE_CODE = { who: 0, work: 1, line: 2, era: 3, kw: 4, lang: 5, year: 6, exam: 7 };
const LESSON_MAX = 10;
const bookLabel = (id) => BOOKS.find((b) => b.id === id).label;

const problems = [];
const sourceDigests = {};
for (const [id, s] of Object.entries(SOURCES)) {
  for (const f of s.files) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) problems.push(`SOURCE-FILE-MISSING ${id} ${f}`);
    else sourceDigests[f] = sha(fs.readFileSync(p));
  }
}
const CODE = ["scripts/build-bank.mjs", "scripts/content/nobel.mjs", "scripts/content/poetry.mjs", "scripts/content/canon.mjs", "scripts/lib/sources.mjs", "data/curated/qa-fixes.mjs"];
const codeDigest = sha(CODE.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n"));

// 題目審校表：以題號為鍵的措辭、材料、解析修正與不當干擾項（data/curated/qa-fixes.mjs；兩輪模型審校確認、人工逐條判斷）
const FIXES = (await import(path.join(root, "data/curated/qa-fixes.mjs"))).default;
const usedFix = new Set();
const avoidHit = new Set();
const nobelCards = loadNobel(root, problems);
const shiCards = await loadPoetry(root, problems);
const canon = await loadCanon(root, problems, nobelCards);
// 真卷殿：指考與北京卷，一年一卡（只有一題的年份與下一年合成一卡，讓每張卡至少兩題）。指考卡號沿用 ex-<學年>，舊存檔不變。
const EXAMS = [
  { key: "tw", file: "data/raw/exams/tw-literature.json", src: "tw-exams", id: (y) => `ex-${y}`, name: (labels) => (labels.length > 1 ? `指考 ${labels[0]}–${labels[labels.length - 1]}` : `指考 ${labels[0]}`) },
  { key: "bj", file: "data/raw/exams/bj-literature.json", src: "bj-exams", id: (y) => `ex-bj-${y}`, name: (labels, years) => (years.length > 1 ? `北京卷 ${years[0]}–${years[years.length - 1]}` : `北京卷 ${years[0]}`) },
];
// 指考附圖（scripts/fetch/exam_figures.mjs 從原卷 PDF 裁出）：題文提到圖（「見圖」「附圖」）就必須有附圖，否則無法作答、建置失敗
const FIGS = JSON.parse(fs.readFileSync(path.join(root, "data/raw/exams/tw-figures.json"), "utf8")).figures;
const usedFig = new Set();
const figOf = (q) => {
  const needs = /見圖|附圖/.test(q.stem + q.passage + q.options.map((o) => o.text).join(""));
  const rec = q.exam === "tw" ? FIGS[q.id] : undefined;
  if (needs && !rec) problems.push(`EXAM-FIGURE-MISSING ${q.id}`);
  if (!rec) return null;
  usedFig.add(q.id);
  const p = path.join(root, rec.file);
  if (!fs.existsSync(p) || sha(fs.readFileSync(p)) !== rec.sha256) problems.push(`EXAM-FIGURE-SHA ${q.id} ${rec.file}`);
  if (rec.src !== `/${rec.file.replace(/^public\//, "")}`) problems.push(`EXAM-FIGURE-SRC ${q.id} ${rec.src}`);
  return { fig: [{ src: rec.src, alt: rec.alt, cap: rec.caption, w: rec.width, h: rec.height }], figSource: { label: `原卷附圖（大學入學考試中心原卷 PDF 第 ${rec.page} 頁）`, url: rec.pdf_url, role: "figure" } };
};
const examCards = [];
for (const E of EXAMS) {
  const data = JSON.parse(fs.readFileSync(path.join(root, E.file), "utf8"));
  const byYear = new Map();
  for (const q of data.questions) {
    if (!byYear.has(q.year)) byYear.set(q.year, []);
    byYear.get(q.year).push({ ...q, exam: E.key });
  }
  let pend = [];
  for (const y of [...byYear.keys()].sort((a, b) => a - b)) {
    pend.push(...byYear.get(y));
    if (pend.length < 2) continue;
    const labels = [...new Set(pend.map((q) => q.year_label))];
    const years = [...new Set(pend.map((q) => q.year))];
    examCards.push({ id: E.id(pend[0].year), book: "exam", kind: "work", name: E.name(labels, years), prominence: pend.length * 10, facts: pend.map((q) => ({ p: "exam_item", o: q.id, item: q, src: [E.src] })) });
    pend = [];
  }
  if (pend.length) problems.push(`EXAM-TAIL ${pend.map((q) => q.id).join(",")} (fewer than two items left)`);
}
let cards = [...shiCards, ...canon.cards, ...nobelCards, ...examCards];
for (const c of cards) for (const f of c.facts) for (const s of f.src) if (!SOURCES[s]) problems.push(`SOURCE-UNREGISTERED ${c.id} ${f.p} ${s}`);
// 選項比較鍵：漢字繁簡歸一（李商隱＝李商隐）；含數字或拉丁字母的（公元前5世紀、T.S.艾略特）照原字比較
const optKey = (x) => (/[0-9A-Za-z]/.test(String(x)) ? String(x).replace(/[\s《》〈〉]/g, "") : norm(x));
const primary = (x) => optKey(String(x).split("（")[0]);
// 篇與集、部分與總集互為包含（〈故鄉〉收在《吶喊》、《高老頭》屬《人間喜劇》、《中庸》原是《禮記》一篇）：不同題作正解與干擾項
const containerOf = new Map(cards.filter((c) => c.in).map((c) => [optKey(c.name), optKey(c.in)]));
const related = (a, b) => containerOf.get(primary(a)) === primary(b) || containerOf.get(primary(b)) === primary(a);

// ── 顯示與選項工具 ───────────────────────────────────────────────────
const bookTitle = (t) => (/^[《〈]/.test(t) ? t : `《${t}》`);
const poemTitle = (t) => (/^[《〈]/.test(t) ? t : `〈${t}〉`);
const ESSAYS = new Set(["毛诗序", "报任安书", "典论·论文", "文赋", "与元九书", "梅圣俞诗集序", "题画"]);
const titleOf = (c) => (c.book === "shi" || c.short ? poemTitle(c.name) : bookTitle(c.name));
const titleWithAlt = (c) => (c.alt ? `${titleOf(c)}（${titleOf({ ...c, name: c.alt })}）` : titleOf(c));
// qual＝同名作品的限定語（詩集《繁星》，巴金另有散文〈繁星〉）
const stemTitle = (c) => (c.qual || "") + (c.alt ? `${titleOf(c)}（臺譯${titleOf({ ...c, name: c.alt })}）` : titleOf(c));
const rankBy = (seed, list) => [...list].sort((a, b) => (sha(seed + a) < sha(seed + b) ? -1 : 1));
const fixAvoid = (qid, cand) => (FIXES[qid]?.avoid || []).some((a) => optKey(a) === optKey(cand) || optKey(a) === primary(cand));
function pickDistractors(qid, answer, tiers, avoid = () => false) {
  const out = [];
  for (const tier of tiers) {
    for (const cand of rankBy(qid, [...new Set(tier)])) {
      if (out.length === 3) break;
      if (!cand || cand === answer || out.includes(cand) || avoid(cand)) continue;
      // 繁簡同名不算兩個選項；與正解互相包含的篇、集不當干擾項
      if (optKey(cand) === optKey(answer) || out.some((o) => optKey(o) === optKey(cand)) || related(cand, answer)) continue;
      if (fixAvoid(qid, cand)) {
        avoidHit.add(qid);
        continue;
      }
      out.push(cand);
    }
  }
  return out;
}
// 體裁上下位或口徑交疊（軍記物語是物語的一類；《琵琶記》在傳奇總集裡；三言兼收話本與擬話本）：不互作干擾項
const GENRE_OVERLAP = { 軍記物語: ["物語"], 物語: ["軍記物語"], 南戏: ["传奇"], 杂剧: [], 传奇: ["南戏", "文言短篇小说集"], 文言短篇小说集: ["传奇", "志怪小说", "笔记小说"], 话本小说集: ["拟话本小说集"], 拟话本小说集: ["话本小说集"] };
const genreAvoid = (ans) => (x) => (GENRE_OVERLAP[ans] || []).includes(x);
// 總集互收（《玉臺新詠》也收〈古詩十九首〉中的多首、〈孔雀東南飛〉）
const COLL_OVERLAP = { 古诗十九首: ["玉台新咏"], 乐府诗集: ["玉台新咏"], 玉台新咏: ["古诗十九首", "乐府诗集"] };
// 晚清作家也是中國近代作家：清與近現代不互作干擾項
const ERA_OVERLAP = { 清: ["近現代"], 近現代: ["清"] };
const srcList = (ids) => [...new Set(ids)].map((id) => ({ label: SOURCES[id].label, url: SOURCES[id].url, role: SOURCES[id].role }));
const leaks = (text, title) => {
  const t = titleKey(title);
  const l = norm(text);
  if (t.length >= 2 && l.includes(t)) return true;
  for (let i = 0; i + 3 <= t.length; i++) if (l.includes(t.slice(i, i + 3))) return true;
  return false;
};
const nearEras = (era) => {
  const i = ERAS.indexOf(era);
  return ERAS.filter((e, j) => e !== era && Math.abs(j - i) <= 2);
};
const neighbourCenturies = (label) => {
  const m = label.match(/^(公元前)?(\d+)世紀$/);
  const n = m[1] ? -parseInt(m[2], 10) : parseInt(m[2], 10);
  return [-3, -2, -1, 1, 2, 3].map((d) => n + d).filter((x) => x !== 0).map((x) => (x < 0 ? `公元前${-x}世紀` : `${x}世紀`));
};
// 選本或語料字句有誤（漁父／漁火、雁門關／玉門關）時，題面與解析用通行本，解析註明底本字句
const shown = (f) => f.pop || f.o;
const popNote = (f) => (f.pop ? `（所據底本作「${f.o}」）` : "");
// 解析把題幹改寫成陳述句（「……的是誰？」→「……的是某某。」），讀解析就能記住這條事實
const restate = (stem, ans) => (/(是誰|是哪一[位部篇首種][^？]*)？$/.test(stem) ? stem.replace(/(是誰|是哪一[位部篇首種][^？]*)？$/, `是${ans}。`) : `答案是${ans}。`);

// ── 題庫索引 ─────────────────────────────────────────────────────────
const byBook = (b) => cards.filter((c) => c.book === b);
const works = (b) => byBook(b).filter((c) => c.kind === "work");
const persons = (b) => byBook(b).filter((c) => c.kind === "person");
// 全庫同名作品（奧維德與卡夫卡的《變形記》、奧古斯丁與盧梭的《懺悔錄》）：不出「作者是誰」
const titleBooks = new Map();
for (const c of cards) if (c.kind === "work" && c.book !== "exam") titleBooks.set(norm(c.name), (titleBooks.get(norm(c.name)) || 0) + 1);
const dupTitle = (c) => titleBooks.get(norm(c.name)) > 1;
// 諾貝爾得主卡已問過的代表作，作品卡不再問作者
const nobelWork = new Set(nobelCards.flatMap((c) => c.facts.filter((f) => f.p === "notable_work").map((f) => `${c.name}|${norm(f.o)}`)));
// 冊內作者池：作品的作者與人物卡（附國別、時代）
const authorMeta = new Map();
for (const c of cards) {
  if (c.kind === "person") authorMeta.set(`${c.book}|${c.name}`, { name: c.name, country: c.country || "", era: c.era || "" });
}
for (const c of cards) if (c.kind === "work" && c.author && !authorMeta.has(`${c.book}|${c.author}`)) authorMeta.set(`${c.book}|${c.author}`, { name: c.author, country: c.country || "", era: c.era || c.dyn || "" });
const authorsOf = (b) => [...authorMeta.entries()].filter(([k]) => k.startsWith(`${b}|`)).map(([, v]) => v);
const shiPoets = persons("shi");
const shiTitleOk = works("shi").filter((w) => w.titleOk);
// 體裁備用池分中外：外國作品不拿「雜劇」「章回小說」當干擾項，中國作品不拿「物語」「和歌」
const WORLD_GENRES = ["史詩", "悲劇", "喜劇", "寓言", "抒情詩", "書信體小說", "散文詩", "和歌", "物語", "隨筆", "軍記物語"];
const ZH_GENRES = ["章回小说", "文言短篇小说集", "笔记小说", "志怪小说", "传奇", "话本小说集", "拟话本小说集", "杂剧", "南戏", "散文诗"];
const TI_GENRES = ["语录体", "编年体", "纪传体", "国别体", "纪事本末体"];
const SCHOOLS = ["儒家", "道家", "法家", "墨家", "杂家", "兵家"];
const COUNTRIES = ["英國", "法國", "德國", "意大利", "西班牙", "俄國", "美國", "奧地利", "愛爾蘭", "挪威", "丹麥", "阿根廷", "墨西哥", "古巴", "捷克", "尼日利亞", "黎巴嫩"];
// 俄國與蘇聯互不作干擾項（蘇聯作家多生於俄國、用俄語寫作）
const COUNTRY_OVERLAP = { 蘇聯: ["俄國"], 俄國: ["蘇聯"] };
const countryAvoid = (ans) => (x) => (COUNTRY_OVERLAP[ans] || []).includes(x);
const countryShow = (c) => (COUNTRY_TW[c] ? `${c}（${COUNTRY_TW[c]}）` : c);

const questions = [];
const seenFacts = new Set();
function add(card, f, t, stem, s, answer, distractors, why, extraSources = [], extra = {}) {
  const qid = `q-${h(`${card.id}|${f.p}|${f.o}|${t}`)}`;
  // 同一張卡的同一條事實只出一題；不同卡若題幹、引文、正解完全相同也算重複
  for (const key of [`fact|${card.id}|${f.p}|${f.o}`, `text|${stem}|${s}|${answer}`]) {
    if (seenFacts.has(key)) problems.push(`DUP ${card.id} ${key}`);
    seenFacts.add(key);
  }
  // 審校表：drop＝題目本身無法唯一作答（年代跨世紀等）不出；stem／s／why 覆蓋措辭；replace 指定替換的干擾項。題號不變，舊紀錄照常對應
  const fx = FIXES[qid];
  if (fx) {
    usedFix.add(qid);
    if (fx.drop) return;
    for (const [from, to] of Object.entries(fx.replace || {})) {
      const i = distractors.indexOf(from);
      if (i < 0) problems.push(`QA-FIX-REPLACE-MISS ${qid} ${from}`);
      else distractors = distractors.map((d, j) => (j === i ? to : d));
    }
    if (fx.stem) stem = fx.stem;
    if (fx.s !== undefined) s = fx.s;
    if (fx.why) why = fx.why;
  }
  if (distractors.length < 3) problems.push(`OPTIONS-SHORT ${qid} ${card.id} ${card.name} ${f.p} ${f.o} (${distractors.length})`);
  if (new Set([answer, ...distractors]).size !== 1 + distractors.length) problems.push(`OPTIONS-DUP ${qid}`);
  questions.push({ id: qid, c: card.id, t, stem, s, opts: [answer, ...distractors], why, src: { label: bookLabel(card.book), title: "", book: card.book }, sources: [...srcList(f.src), ...extraSources], book: card.book, f: f.p, ...extra });
}
const qidOf = (c, f, t) => `q-${h(`${c.id}|${f.p}|${f.o}|${t}`)}`;

// ── 諾貝爾星河 ──
for (const c of nobelCards) {
  const nm = c.name;
  const samePhase = nobelCards.filter((x) => x.phase.id === c.phase.id && x.year !== c.year).map((x) => x.name);
  const nearYears = nobelCards.filter((x) => Math.abs(x.year - c.year) <= 12 && x.year !== c.year).map((x) => x.name);
  const others = nobelCards.filter((x) => x.year !== c.year).map((x) => x.name);
  const wdSrc = c.url ? [{ label: "維基百科條目", url: c.url, role: "reference" }] : [];
  const nobelLangs = [...new Set(nobelCards.flatMap((x) => x.facts.filter((g) => g.p === "writing_lang").map((g) => g.o)))];
  for (const f of c.facts) {
    if (f.p === "nobel_year") {
      const shared = nobelCards.some((x) => x.year === c.year && x.id !== c.id);
      add(c, f, "year", `${c.year}年諾貝爾文學獎${shared ? "得主之一" : "得主"}是誰？`, "", nm, pickDistractors(qidOf(c, f, "year"), nm, [samePhase.filter((x) => nearYears.includes(x)), samePhase, others]), `${nm}（${c.en}），${c.year}年諾貝爾文學獎。授獎辭重點：${c.facts.find((x) => x.p === "citation_kw").label}。`, wdSrc);
    } else if (f.p === "citation_kw") {
      // 授獎辭短語裡出現得主姓名（「卡爾費爾特的詩」）等於洩題，不出
      const surname = String(c.en || "").split(/\s+/).pop().toLowerCase();
      if (surname && f.o.toLowerCase().includes(surname)) {
        problems.push(`NOBEL-KW-NAMES-LAUREATE ${c.year} ${c.en} (skipped)`);
        continue;
      }
      add(c, f, "kw", `授獎辭以下面這句稱述的是哪一位得主？（${f.label}）`, f.o, nm, pickDistractors(qidOf(c, f, "kw"), nm, [samePhase, others]), `${c.year}年授獎辭寫到 “${f.o}”（${f.label}），得主是${nm}。此年屬授獎辭「${c.phase.label}」一期。`, [{ label: `${c.year}年授獎辭原文`, url: "https://www.nobelprize.org/prizes/literature/", role: "official" }]);
    } else if (f.p === "notable_work") {
      const avoid = (cand) => nobelCards.find((x) => x.name === cand)?.facts.some((g) => g.p === "notable_work" && g.o === f.o);
      add(c, f, "work", `${bookTitle(f.o)}${f.alt ? `（臺譯${bookTitle(f.alt)}）` : ""}是哪一位諾貝爾文學獎得主的作品？`, "", nm, pickDistractors(qidOf(c, f, "work"), nm, [samePhase, others], avoid), `${bookTitle(f.o)}是${nm}的代表作之一（Wikidata 列為其代表作，${f.qid}）。${nm}於${c.year}年獲獎。`);
    } else if (f.p === "writing_lang") {
      add(c, f, "lang", `${nm}主要以哪一種語言寫作？`, "", f.o, pickDistractors(qidOf(c, f, "lang"), f.o, [nobelLangs]), `${nm}的寫作語言是${f.o}${f.raw && f.raw !== f.o ? `（Wikidata 標為「${f.raw}」）` : "（Wikidata）"}。`);
    }
  }
}

// ── 並稱、流派、合璧（各冊共用） ──
function groupQuestions(c) {
  const show = (m) => (c.groupKind === "works" ? bookTitle(m) : m);
  const stem = c.groupKind === "works" ? `下列哪一部屬於「${c.name}」？` : c.groupKind === "chars" ? `下列哪一位是「${c.name}」之一？` : `下列哪一位屬於「${c.name}」？`;
  for (const f of c.facts) {
    const ds = pickDistractors(qidOf(c, f, "who"), f.o, [c.pool], (x) => c.members.includes(x)).map(show);
    add(c, f, "who", stem, "", show(f.o), ds, `「${c.name}」指：${c.members.map(show).join("、")}。`);
  }
}

// ── 雲山詩國 ──
for (const c of byBook("shi")) {
  if (c.kind === "group") {
    groupQuestions(c);
    continue;
  }
  if (c.kind === "work") {
    const T = poemTitle(c.name);
    const by = c.anon ? "" : `${c.dynasty ? `${c.dynasty}·` : ""}${c.author}`;
    const sameAuthor = shiTitleOk.filter((x) => x.author === c.author && x.id !== c.id).map((x) => poemTitle(x.name));
    const sameEra = shiTitleOk.filter((x) => x.era === c.era && x.id !== c.id).map((x) => poemTitle(x.name));
    const allT = shiTitleOk.filter((x) => x.id !== c.id).map((x) => poemTitle(x.name));
    const eraPoets = shiPoets.filter((p) => p.era === c.era).map((p) => p.name);
    const allPoets = shiPoets.map((p) => p.name);
    const note = c.note ? `（${c.note}）` : "";
    for (const f of c.facts) {
      if (f.p === "title_author") add(c, f, "who", `${T}的作者是誰？`, "", f.o, pickDistractors(qidOf(c, f, "who"), f.o, [eraPoets, allPoets]), `${T}，${by}。${note}`);
      else if (f.p === "line_work") add(c, f, "line", "下面這句出自哪一篇？", shown(f), T, pickDistractors(qidOf(c, f, "line"), T, [sameAuthor, sameEra, allT]), `「${shown(f)}」出自${by}${T}。${popNote(f)}${note}`);
      else if (f.p === "line_author") add(c, f, "line", "下面這句的作者是誰？", shown(f), c.author, pickDistractors(qidOf(c, f, "line"), c.author, [eraPoets, allPoets]), `「${shown(f)}」出自${by}${T}。${popNote(f)}${note}`);
      else if (f.p === "work_collection") add(c, f, "work", `${T}出自哪一部詩集？`, "", bookTitle(f.o), pickDistractors(qidOf(c, f, "work"), f.o, [COLLECTIONS], (x) => (COLL_OVERLAP[f.o] || []).includes(x)).map(bookTitle), `${T}出自${bookTitle(f.o)}。`);
      else if (f.p === "work_part") add(c, f, "work", `${T}屬於《詩經》的哪一部分？`, "", f.o, pickDistractors(qidOf(c, f, "work"), f.o, [SHIJING_PARTS]), `${T}屬於《詩經》的「${f.o}」。《詩經》分風、雅、頌三部分，雅又分大雅、小雅。`);
    }
    continue;
  }
  // 詩人
  const eraPoets = shiPoets.filter((p) => p.era === c.era && p.id !== c.id).map((p) => p.name);
  const otherPoets = shiPoets.filter((p) => p.id !== c.id).map((p) => p.name);
  for (const f of c.facts) {
    if (f.p === "poet_era") add(c, f, "era", `${c.name}是哪一個時代的作家？`, "", f.o, pickDistractors(qidOf(c, f, "era"), f.o, [nearEras(f.o), ERAS], (x) => (ERA_OVERLAP[f.o] || []).includes(x)), `${c.name}，課本或選本標為「${f.raw}」，屬${f.o}。`);
    else if (f.p === "poet_aka") add(c, f, "who", f.o, "", c.name, pickDistractors(qidOf(c, f, "who"), c.name, [eraPoets, otherPoets]), `${restate(f.o, c.name)}（${c.era}）`);
    else if (f.p === "poet_work") {
      const other = shiTitleOk.filter((x) => norm(x.author) !== norm(c.name));
      add(c, f, "work", `下列哪一篇是${c.name}的作品？`, "", poemTitle(f.o), pickDistractors(qidOf(c, f, "work"), poemTitle(f.o), [other.filter((x) => x.era === c.era).map((x) => poemTitle(x.name)), other.map((x) => poemTitle(x.name))]), `${poemTitle(f.o)}是${c.name}的作品。`);
    }
  }
}

// ── 經典各冊（文淵、說部、新潮、萬國各海區、思潮館） ──
for (const b of ["wen", "shuo", "xin", "aegean", "rome", "east", "europe", "c19", "modern", "fusang", "schools"]) {
  const W = works(b);
  const P = persons(b);
  const A = authorsOf(b);
  const world = !["wen", "shuo", "xin"].includes(b) && b !== "schools";
  const otherBooksAuthors = authorsOf(b === "wen" ? "shuo" : b === "shuo" ? "wen" : b === "xin" ? "shuo" : "c19").map((a) => a.name);
  for (const c of byBook(b)) {
    if (c.kind === "group") {
      groupQuestions(c);
      continue;
    }
    if (c.kind === "term") {
      const T = byBook(b).filter((x) => x.kind === "term" && x.id !== c.id);
      const inShow = (x) => (ESSAYS.has(x) ? poemTitle(x) : bookTitle(x));
      for (const f of c.facts) {
        if (f.p === "term_by") add(c, f, "who", c.byVerb ? `「${c.name}」這一主張由誰${c.byVerb}？` : `「${c.name}」這一主張或概念由誰提出？`, "", f.o, pickDistractors(qidOf(c, f, "who"), f.o, [T.filter((x) => x.termKind === c.termKind && x.by).map((x) => x.by)], (x) => T.some((y) => y.by === x && y.name === c.name)), `「${c.name}」由${f.o}${c.byVerb || "提出"}${c.in ? `，見${inShow(c.in)}` : ""}。`);
        else if (f.p === "term_in") add(c, f, "work", `「${c.name}」出自哪一部著作或哪一篇？`, "", inShow(f.o), pickDistractors(qidOf(c, f, "work"), f.o, [T.filter((x) => x.in).map((x) => x.in)]).map(inShow), `「${c.name}」出自${inShow(f.o)}${c.by ? `（${c.by}）` : ""}。`);
        else if (f.p === "term_gist") {
          if (norm(f.o).includes(norm(c.name)) && norm(c.name).length >= 2) {
            problems.push(`TERM-GIST-LEAK ${c.name}`);
            continue;
          }
          add(c, f, "kw", c.termKind === "form" ? "下面說的是哪一種文體？" : "下面說的是哪一個主張或概念？", f.o, c.name, pickDistractors(qidOf(c, f, "kw"), c.name, [T.filter((x) => x.termKind === c.termKind).map((x) => x.name)]), `「${c.name}」：${f.o}。${c.by ? `${c.byVerb ? `${c.byVerb}者` : "提出者"}：${c.by}。` : ""}`);
        } else if (f.p === "term_example") add(c, f, "work", `下列哪一篇屬於「${c.name}」？`, "", f.o, pickDistractors(qidOf(c, f, "work"), f.o, [T.filter((x) => x.termKind === "form").flatMap((x) => x.facts.filter((g) => g.p === "term_example").map((g) => g.o))]), `${f.o}是${c.name}的代表作之一。${c.name}：${c.facts.find((g) => g.p === "term_gist")?.o || ""}。`);
        else if (f.p === "term_quote") add(c, f, "line", "下面這句出自哪一篇？", f.o, poemTitle(f.piece), pickDistractors(qidOf(c, f, "line"), poemTitle(f.piece), [T.flatMap((x) => x.facts.filter((g) => g.p === "term_quote").map((g) => poemTitle(g.piece))), [...ESSAYS].map(poemTitle)]), `「${f.o}」出自${poemTitle(f.piece)}，與「${c.name}」有關。`);
      }
      continue;
    }
    if (c.kind === "work") {
      const T = stemTitle(c);
      const Ans = titleWithAlt(c);
      const peers = W.filter((x) => x.id !== c.id);
      const same = (x) => (world ? x.country && x.country === c.country : x.dyn && x.dyn === c.dyn);
      const sameAuthor = peers.filter((x) => c.author && x.author === c.author).map(titleWithAlt);
      const similar = peers.filter(same).map(titleWithAlt);
      const allW = peers.filter((x) => !x.isBook || c.isBook).map(titleWithAlt);
      const byText = c.author ? `${c.author}` : "";
      for (const f of c.facts) {
        if (f.p === "work_author") {
          if (dupTitle(c) || c.generic || norm(c.name).includes(norm(f.o)) || nobelWork.has(`${f.o}|${norm(c.name)}`)) continue;
          const me = authorMeta.get(`${b}|${f.o}`) || {};
          const tiers = [A.filter((a) => a.name !== f.o && (world ? me.country && a.country === me.country : me.era && a.era === me.era)).map((a) => a.name), A.map((a) => a.name), otherBooksAuthors];
          // role＝編纂、整理類（《戰國策》劉向整理編訂）：不問「作者」；also＝合著者：問「作者之一」，合著者不當干擾項
          const co = c.also || [];
          const stem = c.role ? `${T}是由誰${c.role}的？` : co.length ? `下列哪一位是${T}的作者之一？` : `${T}的作者是誰？`;
          const where = c.dyn ? `（${c.dyn}）` : c.country ? `（${c.country}）` : "";
          const why = c.role ? `${T}由${f.o}${c.role}${where}${c.roleNote ? `；${c.roleNote}` : ""}。` : co.length ? `${T}是${[f.o, ...co].join("與")}合著的作品${where}；本題選項中只有${f.o}。` : `${T}的作者是${f.o}${where}。`;
          add(c, f, "who", stem, "", f.o, pickDistractors(qidOf(c, f, "who"), f.o, tiers, (x) => co.includes(x) || W.some((w) => w.author === x && norm(w.name) === norm(c.name))), `${why}${c.qid ? `Wikidata 作品條目 ${c.qid} 核對作者。` : ""}`);
        } else if (f.p === "work_src") add(c, f, "work", `${T}選自哪一部典籍？`, "", bookTitle(f.o), pickDistractors(qidOf(c, f, "work"), f.o, [W.filter((x) => x.isBook).map((x) => x.name), ["世说新语", "史记", "聊斋志异", "梦溪笔谈", "水经注", "陶庵梦忆", "资治通鉴", "庄子", "荀子"]]).map(bookTitle), `${T}選自${bookTitle(f.o)}${c.author ? `，作者${c.author}` : ""}。`);
        else if (f.p === "work_char") {
          if (norm(f.o) && (norm(f.o).includes(norm(c.name)) || norm(c.name).includes(norm(f.o)))) continue;
          const avoid = (x) => (f.also || []).some((a) => optKey(a) === primary(x)) || W.some((w) => titleWithAlt(w) === x && w.facts.some((g) => g.p === "work_char" && g.o === f.o));
          add(c, f, "work", `「${f.o}」是哪一部作品中的人物？`, "", Ans, pickDistractors(qidOf(c, f, "work"), Ans, [sameAuthor, similar, allW], avoid), `「${f.o}」${f.en ? `（${f.en}）` : ""}是${byText}${T}中的人物。${f.wd ? "Wikidata 人物表核對。" : ""}`);
        } else if (f.p === "work_line") {
          if (f.piece) {
            add(c, f, "line", "下面這句出自哪一部典籍？", f.o, Ans, pickDistractors(qidOf(c, f, "line"), Ans, [W.filter((x) => x.isBook && x.id !== c.id).map(titleWithAlt)]), `「${f.o}」出自${T}（課本選文〈${f.piece}〉）。`);
            continue;
          }
          if (leaks(f.o, c.name)) {
            if (c.author && !c.isBook) {
              const me = authorMeta.get(`${b}|${c.author}`) || {};
              add(c, f, "line", world ? "下面這句（譯文）出自哪一位作家？" : "下面這句出自哪一位作家？", f.o, c.author, pickDistractors(qidOf(c, f, "line"), c.author, [A.filter((a) => a.name !== c.author && (world ? a.country === me.country : a.era === me.era)).map((a) => a.name), A.map((a) => a.name)]), `「${f.o}」出自${c.author}${T}。`);
            } else problems.push(`LINE-LEAKS-TITLE ${c.name} ${f.o}`);
            continue;
          }
          add(c, f, "line", c.textbook ? "下面這句出自哪一篇？" : world ? "下面這句（譯文）出自哪一部作品？" : "下面這句出自哪一部作品？", f.o, Ans, pickDistractors(qidOf(c, f, "line"), Ans, [sameAuthor, similar, allW]), `「${f.o}」出自${byText}${T}。`);
        } else if (f.p === "work_fame") {
          if (leaks(f.o, c.name)) {
            problems.push(`FAME-LEAKS-TITLE ${c.name} ${f.o}`);
            continue;
          }
          const byLine = c.role ? `${c.role}者：${byText}${c.roleNote ? `（${c.roleNote}）` : ""}。` : c.roleNote ? `${c.roleNote}。` : byText ? `作者：${byText}。` : "";
          add(c, f, "kw", f.o, "", Ans, pickDistractors(qidOf(c, f, "kw"), Ans, [similar, allW, sameAuthor]), `${restate(f.o, T)}${byLine}`);
        } else if (f.p === "work_genre") {
          const pool = [...new Set(W.map((x) => x.facts.find((g) => g.p === "work_genre")?.o).filter(Boolean))];
          add(c, f, "work", `${T}屬於哪一種體裁？`, "", f.o, pickDistractors(qidOf(c, f, "work"), f.o, [pool, world ? WORLD_GENRES : ZH_GENRES], genreAvoid(f.o)), `${T}是${f.o}。`);
        } else if (f.p === "book_genre") add(c, f, "work", `${T}屬於哪一種體例？`, "", f.o, pickDistractors(qidOf(c, f, "work"), f.o, [TI_GENRES]), `${T}是${f.o}。`);
        else if (f.p === "book_school") add(c, f, "work", `${T}屬於哪一家的著作？`, "", f.o, pickDistractors(qidOf(c, f, "work"), f.o, [SCHOOLS]), `${T}屬於${f.o}。`);
        else if (f.p === "work_country") {
          const pool = [...new Set(W.map((x) => x.country).filter(Boolean))];
          add(c, f, "lang", `${T}是哪一個國家或地區的作品？`, "", countryShow(f.o), pickDistractors(qidOf(c, f, "lang"), f.o, [pool, COUNTRIES], countryAvoid(f.o)).map(countryShow), `${T}是${f.o}的作品。`);
        } else if (f.p === "work_dyn") add(c, f, "era", `${T}是哪一個朝代的作品？`, "", f.o, pickDistractors(qidOf(c, f, "era"), f.o, [nearEras(f.o), ERAS], (x) => (c.dynAlso || []).includes(x)), `${T}，${f.o}${c.author ? `·${c.author}` : ""}。`);
        else if (f.p === "work_century") {
          // dated＝編輯核定的年代說明（創作與出版分開說）；否則照 Wikidata：P577 是出版年，不寫成「成書」
          const wd = f.year == null ? "" : `（Wikidata ${f.yearProp === "P577" ? "記出版於" : "年代約"} ${f.year < 0 ? `公元前 ${-f.year}` : f.year} 年）`;
          add(c, f, "era", `${T}成書於哪一個世紀？`, "", f.o, pickDistractors(qidOf(c, f, "era"), f.o, [neighbourCenturies(f.o)]), f.dated ? `${T}${f.dated}` : `${T}成書於${f.o}${wd}。`);
        }
      }
      continue;
    }
    // 人物
    const me = c;
    const peers = [...new Set([...P.filter((x) => x.id !== c.id).map((x) => x.name), ...A.map((a) => a.name).filter((x) => x !== c.name)])];
    const close = P.filter((x) => x.id !== c.id && (world ? x.country && x.country === me.country : x.era && x.era === me.era)).map((x) => x.name);
    for (const f of c.facts) {
      if (f.p === "person_aka") {
        if (norm(f.o).includes(norm(c.name))) {
          problems.push(`AKA-LEAK ${c.name} ${f.o}`);
          continue;
        }
        add(c, f, "who", f.o, "", c.name, pickDistractors(qidOf(c, f, "who"), c.name, [close, peers, otherBooksAuthors]), `${restate(f.o, c.name)}${c.country ? `（${c.country}）` : c.era ? `（${c.era}）` : ""}${c.works?.length ? `代表作：${c.works.slice(0, 3).map((x) => titleOf({ ...W.find((w) => w.name === x), name: x })).join("、")}。` : ""}`);
      } else if (f.p === "person_work") {
        const w = W.find((x) => x.name === f.o);
        const ans = titleWithAlt(w);
        const others = W.filter((x) => x.author !== c.name);
        add(c, f, "work", `下列哪一部是${c.name}的作品？`, "", ans, pickDistractors(qidOf(c, f, "work"), ans, [others.filter((x) => (world ? x.country && x.country === me.country : x.dyn === w.dyn)).map(titleWithAlt), others.map(titleWithAlt)], (x) => W.some((v) => titleWithAlt(v) === x && (v.also || []).includes(c.name))), `${titleOf(w)}是${c.name}的作品。`);
      } else if (f.p === "person_country") {
        const pool = [...new Set(P.map((x) => x.country).filter(Boolean))];
        add(c, f, "lang", `${c.name}是哪一國的作家？`, "", countryShow(f.o), pickDistractors(qidOf(c, f, "lang"), f.o, [pool, COUNTRIES], countryAvoid(f.o)).map(countryShow), `${c.name}是${f.o}作家。`);
      } else if (f.p === "person_genre") add(c, f, "work", `${c.name}以哪一種體裁著稱？`, "", f.o, pickDistractors(qidOf(c, f, "work"), f.o, [world ? WORLD_GENRES : ZH_GENRES, [...WORLD_GENRES, ...ZH_GENRES]], genreAvoid(f.o)), `${c.name}以${f.o}著稱。`);
      else if (f.p === "person_line") add(c, f, "line", world ? "下面這句（譯文）出自哪一位作家？" : "下面這句出自哪一位作家？", f.o, c.name, pickDistractors(qidOf(c, f, "line"), c.name, [close, peers]), `「${f.o}」出自${c.name}。`);
      else if (f.p === "person_era") add(c, f, "era", `${c.name}是哪一個朝代的作家？`, "", f.o, pickDistractors(qidOf(c, f, "era"), f.o, [nearEras(f.o), ERAS], (x) => (c.eraAlso || []).includes(x)), `${c.name}是${f.o}代作家${c.works?.length ? `，代表作${c.works.slice(0, 2).map((x) => titleOf({ ...W.find((w) => w.name === x), name: x })).join("、")}` : ""}。`);
    }
  }
}

// ── 真卷殿 ──
for (const c of examCards) {
  for (const f of c.facts) {
    const q = f.item;
    const ans = q.options.find((o) => o.key === q.answer);
    if (!ans) {
      problems.push(`EXAM-ANSWER-MISSING ${q.id}`);
      continue;
    }
    const others = q.options.filter((o) => o.key !== q.answer).map((o) => o.text);
    // 原卷選項字母（與 opts 同序）：真題照原卷次序、標 A–D，解析與答案裡的字母才對得上
    const fg = figOf(q);
    const keys = { keys: [q.answer, ...q.options.filter((o) => o.key !== q.answer).map((o) => o.key)], ...(fg ? { fig: fg.fig } : {}) };
    if (q.exam === "bj") {
      // 北京卷沒有公開的官方答案；用高考站答案核查表（學習參考），解析裡照實說明
      // 延伸只列快照裡的原文與辭書條目（題面、答案出處的核對紀錄不給讀者看）
      const refs = (q.answer_references || []).slice(0, 2).map((r) => ({ label: r.title, url: r.url, role: "reference" }));
      // 逐項解析：高考站給學生看的 AI 參考解析（簡體照錄，刪過處理說明的標節錄）。高考站沒有逐題網址，不給「原條」連結（真題那一條已連到高考站）
      if (q.reasoning) refs.push({ label: `高考站 AI 參考解析（${q.reasoning.model}${q.reasoning.excerpt ? "，節錄" : ""}）`, role: "analysis", note: q.reasoning.text, lang: "zh-Hans" });
      else problems.push(`EXAM-REASONING-MISSING ${q.id}`);
      add(c, f, "exam", q.stem, q.passage, ans.text, others, `${q.year_label}${q.q_num ? `第 ${q.q_num} 題` : ""}，參考答案（${q.answer}）：${ans.text.replace(/[。.]$/, "")}。答案取自高考站北京卷答案核查表：依公開解析與覆核整理的學習參考，原考試機構答案的出版來源未能核實。`, refs, keys);
    } else add(c, f, "exam", q.stem, q.passage, ans.text, others, `指考${q.year_label}第 ${q.q_num} 題，官方答案（${q.answer}）：${ans.text}。`, [...(q.answer_source ? [{ label: "官方答案原檔", url: q.answer_source, role: "official" }] : []), ...(fg ? [fg.figSource] : [])], keys);
  }
}
for (const id of Object.keys(FIGS)) if (!usedFig.has(id)) problems.push(`EXAM-FIGURE-UNUSED ${id}`);

// 人名選項並列臺灣譯名（加繆（卡繆）），兩岸讀者都認得；題幹與解析不動
const altOf = new Map(cards.filter((c) => c.kind === "person" && c.alt).map((c) => [c.name, c.alt]));
for (const c of cards) if (c.kind === "work" && c.author && c.authorAlt) altOf.set(c.author, c.authorAlt);
for (const q of questions) if (q.t !== "exam") q.opts = q.opts.map((o) => (altOf.has(o) ? `${o}（${altOf.get(o)}）` : o));

// 題目少於兩道的卡不成卡（名句洩題、作者不能問之後只剩一題），連題一起拿掉，列在報告
{
  const count = new Map();
  for (const q of questions) count.set(q.c, (count.get(q.c) || 0) + 1);
  const thin = new Set(cards.filter((c) => (count.get(c.id) || 0) < 2).map((c) => c.id));
  for (const c of cards) if (thin.has(c.id)) problems.push(`CARD-THIN-DROPPED ${c.book} ${c.name} (${count.get(c.id) || 0} question)`);
  cards = cards.filter((c) => !thin.has(c.id));
  for (let i = questions.length - 1; i >= 0; i--) if (thin.has(questions[i].c)) questions.splice(i, 1);
}

// ── 稀有度（各冊內按分數分位：SSR 6%、SR 10%、R 20%、其餘 N） ──────────────
function scoreOf(c) {
  if (c.book === "shi") {
    if (c.kind === "work") return (c.inGk ? 2 : 0) + (c.inMs ? 1 : 0) + (c.textbook ? 0 : 0.8) + Math.min(shiPoets.find((p) => p.name === c.author)?.works || 0, 10) * 0.2;
    if (c.kind === "person") return c.works * 1.5 + (c.gkWorks || 0) + (c.aka || 0) * 1.5;
    return 2 + c.members.length * 0.3;
  }
  return c.prominence ?? 30;
}
for (const b of BOOKS) {
  const list = cards.filter((c) => c.book === b.id).sort((a, z) => scoreOf(z) - scoreOf(a) || (a.id < z.id ? -1 : 1));
  list.forEach((c, i) => {
    const q = i / list.length;
    c.tier = q < 0.06 ? "SSR" : q < 0.16 ? "SR" : q < 0.36 ? "R" : "N";
    c.score = Math.round(scoreOf(c) * 100) / 100;
  });
}

// ── 關卡：星河按授獎辭五期、依年份每 10 張卡一關；其餘各冊不按時代分關（關名一露時代，時代題就洩題），以卡號雜湊混編。
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
      const num = i < 10 ? NUM[i] : i < 20 ? `十${NUM[i - 10] === "十" ? "" : NUM[i - 10]}` : `${NUM[Math.floor(i / 10) - 1]}十${i % 10 ? NUM[(i % 10) - 1] : ""}`;
      const title = b.id === "nobel" ? `${PHASES.find((p) => p.id === g).label}·${num}` : `${b.label}·${num}`;
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

// 審校表每一條都必須對上題號（題目被拿掉或題號變了就失效，建置失敗）；avoid 沒有實際排除任何選項的列為提醒
for (const k of Object.keys(FIXES)) if (!usedFix.has(k)) problems.push(`QA-FIX-UNUSED ${k}`);
for (const [k, v] of Object.entries(FIXES)) if (v.avoid && !avoidHit.has(k)) problems.push(`QA-FIX-AVOID-IDLE ${k} ${v.avoid.join("、")}`);

// ── 輸出 ───────────────────────────────────────────────────────────────
// 報告類（官方資料錯配、作品併入作者卡、事實不足而未成卡、洩題略過）不擋建置，列在 BUILD-REPORT
const WARN = ["QA-FIX-AVOID-IDLE", "NOBEL-WIKIDATA-MISMATCH", "NOBEL-KW-NAMES-LAUREATE", "EXAM-TAIL", "POETRY-POET-FOLDED", "CANON-PERSON-FOLDED", "CARD-THIN-DROPPED", "LINE-LEAKS-TITLE", "FAME-LEAKS-TITLE", "AKA-LEAK", "TERM-GIST-LEAK"];
const blocking = problems.filter((p) => !WARN.some((w) => p.startsWith(w)));
const coverage = { canon: canon.stats, byBook: Object.fromEntries(BOOKS.map((b) => [b.id, { cards: cards.filter((c) => c.book === b.id).length, questions: questions.filter((q) => q.book === b.id).length }])) };
const report = { builtAt: new Date().toISOString().slice(0, 10), sources: sourceDigests, codeDigest, coverage, problems };
fs.writeFileSync(path.join(root, "data/BUILD-REPORT.json"), JSON.stringify(report, null, 1) + "\n");
if (STRICT && blocking.length) {
  for (const p of blocking.slice(0, 150)) console.error(p);
  console.error(`BUILD FAILED: ${blocking.length} problems (nothing written)`);
  process.exit(1);
}

const v = h(JSON.stringify(sourceDigests) + codeDigest);
const cardList = cards.map((c) => {
  const qs = questions.filter((q) => q.c === c.id);
  const isNobel = c.book === "nobel";
  const kw = c.facts.find((f) => f.p === "citation_kw");
  const work = c.facts.find((f) => f.p === "notable_work");
  const py =
    c.book === "exam"
      ? `${c.facts.length} 題`
      : isNobel
        ? `${c.year} · ${c.langs.join("／") || c.en}`
        : c.kind === "group"
          ? `${c.members.length} ${c.groupKind === "works" ? "部" : "位"}`
          : c.kind === "term"
            ? [c.termKind === "form" ? "文體" : c.by, c.in ? (ESSAYS.has(c.in) ? poemTitle(c.in) : bookTitle(c.in)) : ""].filter(Boolean).join(" · ")
            : c.book === "shi"
              ? c.kind === "work"
                ? `${c.dynasty}${c.anon ? "" : ` · ${c.author}`}`
                : c.dynasties.join("、")
              : c.kind === "work"
                ? [c.dyn || c.country, c.author].filter(Boolean).join(" · ") || c.en
                : [c.era || c.country, c.en].filter(Boolean).join(" · ");
  const senses =
    c.book === "exam"
      ? [...new Set(c.facts.map((f) => f.item.category))]
      : isNobel
        ? [kw.label, ...(work ? [bookTitle(work.o)] : [])]
        : c.kind === "group"
          ? c.members.map((m) => (c.groupKind === "works" ? bookTitle(m) : m))
          : c.kind === "term"
            ? c.facts.filter((f) => f.p === "term_gist" || f.p === "term_quote").map((f) => f.o)
            : c.kind === "work"
              ? c.facts.filter((f) => ["line_work", "line_author", "work_line", "work_char"].includes(f.p)).map((f) => f.pop || f.o).slice(0, 4)
              : c.facts.filter((f) => ["poet_work", "person_work"].includes(f.p)).map((f) => (c.book === "shi" ? poemTitle(f.o) : bookTitle(f.o)));
  return {
    id: c.id,
    w: c.name,
    key: [c.name, c.alt, c.en, c.author].filter(Boolean).join(" "),
    py,
    kind: c.kind,
    tier: c.tier,
    score: c.score,
    senses,
    lists: c.book === "shi" && c.era ? [c.era] : isNobel ? [`授獎辭·${c.phase.label}`] : [bookLabel(c.book)],
    books: [c.book],
    regions: [BOOKS.find((b) => b.id === c.book).region],
    sw: null,
    dictUrl: c.url || "",
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
const meta = { builtAt: report.builtAt, edition: "書靈 核心經典版", v, books, lessons, cards: cardList, qi, stats };

const chunkDir = path.join(root, "public/bank");
fs.rmSync(chunkDir, { recursive: true, force: true });
fs.mkdirSync(chunkDir, { recursive: true });
fs.writeFileSync(path.join(chunkDir, `meta.${v}.json`), JSON.stringify(meta) + "\n");
for (const b of BOOKS) {
  const qs = questions.filter((q) => q.book === b.id).map((q) => ({ id: q.id, c: q.c, t: q.t, stem: q.stem, s: q.s, opts: q.opts, ...(q.keys ? { keys: q.keys } : {}), ...(q.fig ? { fig: q.fig } : {}), why: q.why, src: q.src, sources: q.sources, diff: 0.5, region: b.region, book: q.book }));
  fs.writeFileSync(path.join(chunkDir, `${b.id}.${v}.json`), JSON.stringify({ v, book: b.id, q: qs }) + "\n");
}
fs.mkdirSync(path.join(root, "src/data"), { recursive: true });
fs.writeFileSync(path.join(root, "src/data/bank-version.json"), JSON.stringify({ v, builtAt: meta.builtAt, questions: questions.length, cards: cardList.length }) + "\n");
const tierOf = new Map(cardList.map((c) => [c.id, c.tier]));
fs.writeFileSync(path.join(root, "worker/bank-index.json"), JSON.stringify({ version: v, q: Object.fromEntries(questions.map((q) => [q.id, { c: q.c, a: sha(q.opts[0]).slice(0, 16), t: q.t, r: tierOf.get(q.c) }])) }) + "\n");
fs.writeFileSync(path.join(root, "worker/lessons.json"), JSON.stringify({ v, lessons: lessons.map((l) => ({ id: l.id, books: l.books, questions: l.questions })) }) + "\n");
console.log(JSON.stringify({ v, ...stats, warnings: problems.length - blocking.length }));

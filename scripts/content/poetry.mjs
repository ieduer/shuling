// 雲山詩國（P1 首批）：琅琅的初中與高考背誦篇目中的詩詞 → 作品卡、詩人卡與事實。
// 題名、作者、詩句保留來源字形（大陸課本簡體為原文軌），只有介面文字用繁體。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);

// 粗分朝代（題目選項用）；原標朝代保留在事實裡。
export const ERAS = ["先秦", "漢", "魏晉", "南北朝", "唐", "五代", "宋", "元", "明", "清", "近現代"];
export function coarseEra(d) {
  const s = String(d || "");
  if (/诗经|战国|春秋|先秦|秦$/.test(s)) return "先秦";
  if (/汉/.test(s)) return "漢";
  if (/三国|晋/.test(s)) return "魏晉";
  if (/南朝|北朝|南北朝|北魏|梁|齐|陈/.test(s)) return "南北朝";
  if (/五代/.test(s)) return "五代";
  if (/唐/.test(s)) return "唐";
  if (/宋/.test(s)) return "宋";
  if (/元/.test(s)) return "元";
  if (/明/.test(s)) return "明";
  if (/清/.test(s)) return "清";
  if (/近/.test(s)) return "近現代";
  return "";
}

const ANON = new Set(["佚名", "", "无名氏"]);
// 來源缺朝代時的補正：evidence 必須逐字出現在同一來源該篇的 authorIntro 裡，建置時核對。
const ERA_FIX = { 十五从军征: { dynasty: "汉", evidence: "本诗为汉代乐府民歌" } };
export const COLLECTIONS = ["诗经", "楚辞", "古诗十九首", "乐府诗集", "玉台新咏"];
// 「先秦·诗经」「汉·古诗十九首」的後半、或作者欄寫成《乐府诗集》，就是這首詩的出處
function collectionOf(p) {
  const m = String(p.author || "").match(/^《(.+)》$/);
  if (m) return m[1];
  const d = String(p.dynasty || "").split("·")[1] || "";
  return COLLECTIONS.includes(d) ? d : "";
}

function pickLines(text) {
  const sents = text
    .split(/(?<=[。！？；])/)
    .map((s) => s.replace(/[“”‘’"]/g, "").trim())
    .filter((s) => s.length >= 9 && s.length <= 26 && s.includes("，"));
  // 詞多半是一句一個句號的短句：沒有逗號長句時，取 7～20 字的單句
  if (!sents.length) {
    const single = text.split(/(?<=[。！？；])/).map((s) => s.replace(/[“”‘’"]/g, "").trim()).filter((s) => s.length >= 8 && s.length <= 21);
    if (!single.length) return [];
    const out1 = [single[single.length - 1]];
    const mid1 = single[Math.floor((single.length - 1) / 2)];
    if (mid1 !== out1[0]) out1.push(mid1);
    return out1.map((x) => x.replace(/[。！？；]$/, ""));
  }
  const out = [sents[sents.length - 1]];
  const mid = sents[Math.floor((sents.length - 1) / 2)];
  if (mid !== out[0]) out.push(mid);
  return out.map((s) => s.replace(/[。！？；]$/, ""));
}

// 只用於比對同一首詩、同一位作者（繁簡兩種來源），不用於顯示
const T2S = JSON.parse(fs.readFileSync(new URL("../lib/t2s-chars.json", import.meta.url), "utf8")).map;
const norm = (s) => Array.from(String(s || "")).map((c) => T2S[c] || c).join("").replace(/[^\p{Script=Han}]/gu, "");

export function loadPoetry(root, problems) {
  const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
  const recite = [
    ...rd("data/raw/recite/recite-ms.json").pieces.map((p) => ({ ...p, srcId: "recite-ms" })),
    ...rd("data/raw/recite/recite-gk.json").pieces.map((p) => ({ ...p, srcId: "recite-gk" })),
  ].filter((p) => p.kind === "shi");
  // 選本：《唐詩三百首》（繁體原文）、《宋詞三百首》（簡體原文）；朝代依選本書名定
  const anth = rd("data/raw/chinese-poetry/anthologies.json");
  const firstClause = (paras) => String(paras[0] || "").split(/[，。、；？！]/)[0];
  const anthology = [
    ...anth.tang300.map((p) => ({ title: p.title, author: p.author, dynasty: "唐", paras: p.paragraphs.map((t) => ({ text: t })), srcId: "cp-anthologies", from: "tang300" })),
    ...anth.song300.map((p) => ({ title: `${p.rhythmic}·${firstClause(p.paragraphs)}`, author: p.author, dynasty: "宋", paras: p.paragraphs.map((t) => ({ text: t })), srcId: "cp-anthologies", from: "song300" })),
  ];

  // 同一首詩以「作者＋正文前十二字」（字形歸一後）辨認；課本來源在前，選本只補課本沒有的
  // 課本與選本之間另以「作者＋題名」對上（異體字如猨／猿會讓正文比對落空）；選本內部同名異篇不合併。
  const works = new Map();
  const byTitle = new Map();
  for (const p of [...recite, ...anthology]) {
    const text = (p.paras || []).map((x) => x.text).join("");
    const author = /^《.+》$/.test(p.author || "") ? "佚名" : p.author || "";
    // 選本資料偶有截斷的作者名（只剩一個字），不採用
    if (p.srcId === "cp-anthologies" && Array.from(author).length < 2) {
      problems.push(`POETRY-ANTH-FOLDED ${p.title} (author "${author}" truncated in source)`);
      continue;
    }
    const titleKey = `${norm(author)}|${norm(p.title)}`;
    // 第三條對法：同作者的課本篇章正文含有選本這首的開頭八字（課本版多了小序，如〈水調歌頭〉「丙辰中秋…」）
    const byText = () => {
      const head = norm(text).slice(0, 8);
      for (const [k, w] of works) if (w.textbook && norm(w.author) === norm(author) && head.length === 8 && norm(w.text).includes(head)) return k;
      return null;
    };
    const key = (p.srcId === "cp-anthologies" && (byTitle.get(titleKey) || byText())) || `${norm(author)}|${norm(text).slice(0, 12)}`;
    if (p.srcId !== "cp-anthologies") byTitle.set(titleKey, key);
    const prev = works.get(key);
    if (prev) {
      prev.srcIds.add(p.srcId);
      continue;
    }
    const collection = p.srcId === "cp-anthologies" ? "" : collectionOf(p);
    let dynasty = p.dynasty || "";
    const fix = ERA_FIX[p.title];
    if (!dynasty && fix) {
      if (!String(p.authorIntro || "").includes(fix.evidence)) problems.push(`POETRY-ERA-FIX-UNSUPPORTED ${p.title}`);
      else dynasty = fix.dynasty;
    }
    works.set(key, { title: p.title, author, collection, dynasty, text, srcIds: new Set([p.srcId]), textbook: p.srcId.startsWith("recite"), first: String(p.paras?.[0]?.text || "").split(/[，。、；？！]/)[0] });
  }

  // 同名異篇（〈春思〉不只一首）在題名後加作者，選項才不會有兩個一樣的題名
  const titleCount = new Map();
  for (const w of works.values()) titleCount.set(norm(w.title), (titleCount.get(norm(w.title)) || 0) + 1);
  for (const w of works.values()) w.display = titleCount.get(norm(w.title)) > 1 && w.first && !w.title.includes("·") ? `${w.title}·${w.first}` : w.title;

  // 詩句只取全庫唯一的（字形歸一後比對），避免同一句出現在兩篇而有兩個正解
  const lineCount = new Map();
  const linesOf = new Map();
  for (const [k, w] of works) {
    const ls = pickLines(w.text);
    linesOf.set(k, ls);
    for (const l of ls) lineCount.set(norm(l), (lineCount.get(norm(l)) || 0) + 1);
  }
  const unique = (l) => lineCount.get(norm(l)) === 1;

  const cards = [];
  const poets = new Map();
  for (const [k, w] of works) {
    const era = coarseEra(w.dynasty);
    if (!era) problems.push(`POETRY-ERA-UNKNOWN ${w.title} ${w.dynasty}`);
    const src = [...w.srcIds];
    const anon = ANON.has(w.author);
    const facts = [];
    if (!anon) facts.push({ p: "work_author", o: w.author, src });
    if (w.collection) facts.push({ p: "work_collection", o: w.collection, src });
    for (const line of linesOf.get(k)) {
      if (!unique(line)) continue;
      if (!w.text.replace(/[“”‘’"]/g, "").includes(line)) problems.push(`POETRY-LINE-NOT-IN-TEXT ${w.title} ${line}`);
      facts.push({ p: "line_of_work", o: line, src });
    }
    const id = `pw-${h(k)}`;
    // 選本裡找不到可考詩句的篇章只當作者的事實，不另成卡（課本篇章一律成卡，不足兩條由建置擋下）
    if (!w.textbook && facts.length < 2) {
      problems.push(`POETRY-ANTH-FOLDED ${w.display} (${facts.length} fact)`);
    } else cards.push({ id, book: "shi", kind: "work", name: w.display, author: w.author, dynasty: w.dynasty, era, anon, group: era, order: ERAS.indexOf(era), facts, srcIds: src, inGk: w.srcIds.has("recite-gk"), inMs: w.srcIds.has("recite-ms"), inAnth: w.srcIds.has("cp-anthologies") });
    if (!anon) {
      const pk = norm(w.author);
      let poet = poets.get(pk);
      if (!poet) poets.set(pk, (poet = { name: w.author, dynasties: new Set(), eras: new Set(), textbookEras: new Set(), works: [], src: new Set() }));
      poet.dynasties.add(w.dynasty);
      poet.eras.add(era);
      if (w.textbook) poet.textbookEras.add(era);
      poet.works.push({ title: w.display, lines: linesOf.get(k).filter(unique), gk: w.srcIds.has("recite-gk") });
      for (const s of src) poet.src.add(s);
    }
  }
  for (const poet of poets.values()) {
    // 課本標的朝代優先（李煜：課本「五代南唐」）；只有選本時以選本為準
    const eras = poet.textbookEras.size ? poet.textbookEras : poet.eras;
    if (eras.size !== 1) {
      problems.push(`POETRY-POET-ERA-AMBIGUOUS ${poet.name} ${[...poet.dynasties].join("/")}`);
      continue;
    }
    const era = [...eras][0];
    const src = [...poet.src];
    const facts = [{ p: "author_era", o: era, raw: [...poet.dynasties].join("、"), src }];
    for (const w of poet.works) facts.push({ p: "author_work", o: w.title, src });
    // 只有一篇的詩人，補一條「詩句 → 作者」，讓收服有兩條不同事實可答
    if (poet.works.length === 1 && poet.works[0].lines[0]) facts.push({ p: "line_author", o: poet.works[0].lines[0], work: poet.works[0].title, src });
    cards.push({ id: `pp-${h(norm(poet.name))}`, book: "shi", kind: "person", name: poet.name, era, dynasties: [...poet.dynasties], group: era, order: ERAS.indexOf(era), facts, works: poet.works.length, gkWorks: poet.works.filter((w) => w.gk).length, srcIds: src });
  }
  return cards;
}

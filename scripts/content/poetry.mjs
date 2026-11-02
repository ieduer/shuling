// 雲山詩國（核心版）：課本背誦篇目＋課本外名篇（data/curated/canon/shi.mjs）→ 作品卡、詩人卡、並稱流派卡與事實。
// 題名、作者、詩句保留來源字形（課本簡體、選本與語料照錄），只有題幹與解析用繁體。
// 題名題只出給「能指認一首詩」的題名：詞牌曲牌（只有詞牌或「詞牌·首句」）不出；與同代或前代他人同題的（樂府舊題、
// 〈登鸛雀樓〉這類，依風雅千載語料普查）不出；這些詩改考名句。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);

export const ERAS = ["先秦", "漢", "魏晉", "南北朝", "唐", "五代", "宋", "元", "明", "清", "近現代"];
export function coarseEra(d) {
  const s = String(d || "");
  if (/诗经|戰國|战国|春秋|先秦|秦$/.test(s)) return "先秦";
  if (/汉|漢/.test(s)) return "漢";
  if (/三国|三國|晋|晉/.test(s)) return "魏晉";
  if (/南朝|北朝|南北朝|北魏|梁|齐|齊|陈|陳|隋/.test(s)) return "南北朝";
  if (/五代/.test(s)) return "五代";
  if (/唐/.test(s)) return "唐";
  if (/宋|遼|辽|金/.test(s)) return "宋";
  if (/元/.test(s)) return "元";
  if (/明/.test(s)) return "明";
  if (/清/.test(s)) return "清";
  if (/近|现代|現代/.test(s)) return "近現代";
  return "";
}
// 風雅千載語料的分代目錄 → 粗分時代
const FILE_ERA = { "01_先秦": "先秦", "02_秦漢": "漢", "03_魏晉": "魏晉", "04_南北朝": "南北朝", "05_隋": "南北朝", "06_唐": "唐", "07_五代": "五代", "08_宋": "宋", "09_遼金": "宋", "10_元": "元", "11_明": "明", "12_清": "清" };
export const COLLECTIONS = ["诗经", "楚辞", "古诗十九首", "乐府诗集", "玉台新咏"];
export const SHIJING_PARTS = ["国风", "小雅", "大雅", "颂"];
// 詞牌、曲牌（題名只有牌名，或牌名後接首句，就不是能指認一首作品的題名）；《宋詞三百首》的全部詞牌另外併入
const TUNES = "沁园春 浣溪沙 如梦令 渔家傲 采桑子 相见欢 卜算子 丑奴儿 行香子 江城子 破阵子 满江红 定风波 临江仙 太常引 南乡子 水调歌头 菩萨蛮 虞美人 望海潮 桂枝香 念奴娇 鹊桥仙 苏幕遮 声声慢 永遇乐 青玉案 贺新郎 扬州慢 忆江南 望江南 渔歌子 渔父 渔父歌 谒金门 雨霖铃 蝶恋花 鹊踏枝 天仙子 玉楼春 木兰花 木兰花令 一剪梅 醉花阴 武陵春 钗头凤 西江月 清平乐 长相思 浪淘沙 浪淘沙令 山坡羊 天净沙 朝天子 一枝花 水仙子 折桂令 沉醉东风 寿阳曲 四块玉 卖花声 殿前欢 清江引 端正好 滚绣球 叨叨令 横塘路 撷芳词 凤栖梧 一翦梅".split(" ");
const ANON = new Set(["佚名", "", "无名氏", "無名氏", "两汉乐府", "北朝民歌"]);
const COLLECTION_OF = { 木兰诗: "乐府诗集", 长歌行: "乐府诗集", 敕勒歌: "乐府诗集", 十五从军征: "乐府诗集", 静女: "诗经", 无衣: "诗经", 涉江采芙蓉: "古诗十九首" };
const PART_OF = { 静女: "国风", 无衣: "国风" };
// 課本快照沒有朝代的篇目（課文注明為漢樂府民歌）
const ERA_FIX = { 十五从军征: "漢" };

const T2S = JSON.parse(fs.readFileSync(new URL("../lib/t2s-chars.json", import.meta.url), "utf8")).map;
export const norm = (s) => Array.from(String(s || "")).map((c) => T2S[c] || c).join("").replace(/[^\p{Script=Han}]/gu, "");
// 與 scripts/fetch/cp_extract.mjs 的題名鍵同一規則
export const titleKey = (t) =>
  norm(
    String(t || "")
      .replace(/[（(][^）)]*[）)]/g, "")
      .replace(/其[一二三四五六七八九十百〇零]+/g, "")
      .replace(/[一二三四五六七八九十百]+首/g, "")
      .replace(/\s+[一二三四五六七八九十百]+$/g, ""),
  );

/** 在原文裡找名句（不計標點、繁簡歸一），回傳原文字形的那一段（去掉頭尾標點）；找不到回 null。 */
export function excerpt(text, line) {
  const chars = Array.from(text);
  const keep = [];
  chars.forEach((c, i) => {
    const n = norm(c);
    if (n) keep.push({ n, i });
  });
  // 以碼點比對（罕用字是代理對，字串下標會與字數錯位）
  const hay = keep.map((x) => x.n);
  const needle = Array.from(norm(line));
  if (!needle.length) return null;
  let at = -1;
  for (let k = 0; k + needle.length <= hay.length && at < 0; k++) if (needle.every((c, j) => hay[k + j] === c)) at = k;
  if (at < 0) return null;
  const from = keep[at].i;
  const to = keep[at + needle.length - 1].i;
  return chars.slice(from, to + 1).join("").replace(/^[\s，。、；：？！“”‘’"「」『』]+|[\s，。、；：？！“”‘’"「」『』]+$/g, "");
}

// 顯示題名整理：去掉樂府類名、把「二首 一」「其一」統一成「（其一）」；題名本身不改字
const CATS = /^(相和歌辭|雜曲歌辭|杂曲歌辞|橫吹曲辭|横吹曲辞|郊廟歌辭|琴曲歌辭|近代曲辭|新樂府辭|雜歌謠辭|清商曲辭|舞曲歌辭|鼓吹曲辭|燕射歌辭)\s*/;
const NUM = "一二三四五六七八九十百〇零";
function tidyTitle(t) {
  let s = String(t || "").replace(CATS, "").trim();
  let m = s.match(new RegExp(`^(.+?)[${NUM}]+首\\s+([${NUM}]+)$`));
  if (m) return `${m[1]}（其${m[2]}）`;
  m = s.match(new RegExp(`^(.+?)[${NUM}]+首\\s+其([${NUM}]+)$`));
  if (m) return `${m[1]}（其${m[2]}）`;
  m = s.match(new RegExp(`^(.+?)\\s+其([${NUM}]+)$`));
  if (m) return `${m[1]}（其${m[2]}）`;
  m = s.match(new RegExp(`^(.+?)[${NUM}]+首\\s+(.+?)\\s+其([${NUM}]+)$`));
  if (m) return `${m[1]}（其${m[3]}）`;
  m = s.match(new RegExp(`^(.+?)\\s+([${NUM}]+)$`));
  if (m) return `${m[1]}（其${m[2]}）`;
  return s;
}

export async function loadPoetry(root, problems) {
  const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
  const C = (await import(path.join(root, "data/curated/canon/shi.mjs"))).default;
  return build(root, problems, C, rd);
}

function build(root, problems, C, rd) {
  const tunes = new Set([...TUNES, ...rd("data/raw/chinese-poetry/anthologies.json").song300.map((p) => p.rhythmic)].map(norm));
  const textbook = [
    ...rd("data/raw/recite/recite-ms.json").pieces.map((p) => ({ ...p, srcId: "recite-ms" })),
    ...rd("data/raw/recite/recite-gk.json").pieces.map((p) => ({ ...p, srcId: "recite-gk" })),
  ].filter((p) => p.kind === "shi");
  const anth = rd("data/raw/chinese-poetry/anthologies.json");
  const extraSnap = rd("data/raw/chinese-poetry/canon-extra.json");
  const pool = [
    ...anth.tang300.map((p) => ({ title: p.title, author: p.author, text: p.paragraphs.join(""), srcId: "cp-anthologies", era: "唐" })),
    ...anth.song300.map((p) => ({ title: p.rhythmic, tune: p.rhythmic, author: p.author, text: p.paragraphs.join(""), srcId: "cp-anthologies", era: "宋" })),
    ...extraSnap.poems.map((p) => ({ title: p.title, author: p.author, text: p.lines.join(""), srcId: "cp-corpus", era: FILE_ERA[p.file.split("/")[1]] || "", note: p.note, file: p.file })),
  ];

  // ── 作品 ──
  const works = [];
  const seen = new Map();
  for (const p of textbook) {
    const text = p.paras.map((x) => x.text).join("");
    const key = `${norm(p.author)}|${norm(text).slice(0, 12)}`;
    if (seen.has(key)) {
      seen.get(key).srcIds.add(p.srcId);
      continue;
    }
    const lines = C.textbook[p.title];
    if (!lines) problems.push(`POETRY-TEXTBOOK-UNCURATED ${p.title} (every textbook poem needs curated lines)`);
    const authorRaw = p.author || "";
    const m = authorRaw.match(/^《(.+)》$/);
    let collection = "";
    let part = "";
    if (m) {
      const [book, sec] = m[1].split("·");
      collection = book;
      if (book === "诗经" && sec) part = /风$/.test(sec) || /南$/.test(sec) ? "国风" : sec.includes("小雅") ? "小雅" : sec.includes("大雅") ? "大雅" : sec.includes("颂") ? "颂" : "";
    }
    const author = m ? "" : authorRaw;
    const coll = collection || COLLECTION_OF[p.title] || "";
    const w = { title: p.title, display: p.title.replace(/\s*·\s*/g, " · ").replace(/[（(]【[^）)]*[）)]/g, ""), author, anon: ANON.has(author), dynasty: p.dynasty || "", era: coarseEra(p.dynasty || (coll === "诗经" ? "先秦" : "")) || ERA_FIX[p.title] || "", text, lines: lines || [], pop: {}, srcIds: new Set([p.srcId]), textbook: true, collection: coll, part: part || PART_OF[p.title] || "" };
    seen.set(key, w);
    works.push(w);
  }
  for (const e of C.extra) {
    const has = (x) => (!e.by || norm(x.author) === norm(e.by)) && norm(x.text).includes(norm(e.q));
    if (textbook.some((p) => has({ author: p.author, text: p.paras.map((x) => x.text).join("") }))) {
      problems.push(`POETRY-EXTRA-IS-TEXTBOOK ${e.t}`);
      continue;
    }
    const src = pool.find(has);
    if (!src) {
      problems.push(`POETRY-EXTRA-NOT-FOUND ${e.t} ${e.by || ""} (${e.q})`);
      continue;
    }
    const author = ANON.has(src.author) || !e.by ? "" : src.author;
    const tidy = tidyTitle(src.title);
    const head = tidy.split(/\s*[·・(（]\s*|\s+/)[0];
    const display = e.title || (src.tune ? (e.sub ? `${src.tune} · ${e.sub}` : src.tune) : e.sub ? `${head} · ${e.sub}` : tidy);
    let collection = e.collection || COLLECTION_OF[e.t] || "";
    let part = "";
    if (src.file?.includes("shijing")) {
      collection = "诗经";
      part = (src.note || "").split("·")[0];
    } else if (src.file?.includes("chuci")) collection = "楚辞";
    else if (/古诗十九首|古詩十九首/.test(src.title)) collection = "古诗十九首";
    works.push({ title: src.title, display, author, anon: !author, dynasty: src.era, era: e.era || src.era, text: src.text, lines: e.lines, pop: e.pop || {}, note: e.note || "", srcIds: new Set([src.srcId]), textbook: false, collection, part, sub: e.sub || "" });
  }

  // ── 題名分類 ──
  const census = extraSnap.titleAuthors;
  const yuefu = new Set(extraSnap.yuefu || []);
  const eraIdx = (e) => ERAS.indexOf(e);
  const whereEra = (w) => (w === "tang300" ? "唐" : w === "song300" ? "宋" : FILE_ERA[w] || "");
  for (const w of works) {
    const head = w.display.split(/\s*[·・(（]\s*|\s+/)[0];
    const rest = w.display.slice(head.length).replace(/^\s*[·・]\s*/, "").trim();
    if (tunes.has(norm(head))) {
      // 「詞牌·題」：題不是首句、不是括號裡的首句，才算真題目
      // 題名後面只是序號（〈憶江南 一〉）、另一個詞牌名（〈鵲踏枝・蝶戀花〉）或括號裡的首句，都不是題目
      const restKey = norm(rest);
      const isSerial = new RegExp(`^[（(]?其?[${NUM}]+[）)]?$`).test(rest);
      const sub = w.sub || (rest && !/^[（(]/.test(rest) && !isSerial && !tunes.has(restKey) ? rest : "");
      w.kind = sub && !norm(w.text).startsWith(norm(sub)) ? "tuneSub" : "tune";
    } else {
      const k = titleKey(w.display);
      const others = Object.entries(census[k] || {}).filter(([a]) => a !== (norm(w.author) || "佚名"));
      const earlier = others.filter(([, where]) => where.some((x) => x === "textbook" || eraIdx(whereEra(x)) <= eraIdx(w.era)));
      w.kind = earlier.length || yuefu.has(k) ? "generic" : "distinctive";
      w.yuefu = yuefu.has(k);
      w.sharedWith = earlier.map(([a]) => a);
    }
  }
  // 同一題名在本冊出現兩次（兩首〈無題〉）：選項會撞，題名題與「出自哪一篇」都不出
  const nameCount = new Map();
  for (const w of works) nameCount.set(norm(w.display), (nameCount.get(norm(w.display)) || 0) + 1);
  for (const w of works) w.uniqueName = nameCount.get(norm(w.display)) === 1;

  // ── 名句 ──
  const lineOwners = new Map();
  for (const w of works) {
    w.shown = [];
    for (const l of w.lines) {
      const ex = excerpt(w.text, l);
      if (!ex) {
        problems.push(`POETRY-LINE-NOT-IN-TEXT ${w.display} ${l}`);
        continue;
      }
      const pop = w.pop[l] || "";
      w.shown.push({ line: ex, pop });
      lineOwners.set(norm(ex), (lineOwners.get(norm(ex)) || 0) + 1);
    }
  }
  for (const w of works) for (const s of w.shown) if (lineOwners.get(norm(s.line)) > 1) problems.push(`POETRY-LINE-DUP ${w.display} ${s.line}`);

  // 名句是否洩漏題名：句中含完整題名（兩字以上）或題名中任何三字
  const leaks = (line, title) => {
    const t = titleKey(title);
    const l = norm(line);
    if (t.length >= 2 && l.includes(t)) return true;
    for (let i = 0; i + 3 <= t.length; i++) if (l.includes(t.slice(i, i + 3))) return true;
    return false;
  };

  // ── 卡 ──
  const cards = [];
  const poets = new Map();
  for (const w of works) {
    if (!w.era) problems.push(`POETRY-ERA-UNKNOWN ${w.display} ${w.dynasty}`);
    const src = [...w.srcIds, "curated-canon"];
    const facts = [];
    const titleOk = (w.kind === "distinctive" || w.kind === "tuneSub") && w.uniqueName;
    if (!w.anon && titleOk && !w.display.includes(w.author)) facts.push({ p: "title_author", o: w.author, src });
    w.shown.forEach((s, i) => {
      const workOk = (titleOk || (w.anon && w.uniqueName && w.kind !== "tune")) && !leaks(s.line, w.display);
      // 名句：題名能指認時，第一句問出處、其餘問作者；題名不能指認時一律問作者（佚名作品只能問出處）
      if (workOk && (i === 0 || w.anon)) facts.push({ p: "line_work", o: s.line, pop: s.pop, src });
      else if (!w.anon) facts.push({ p: "line_author", o: s.line, pop: s.pop, src });
      else problems.push(`POETRY-LINE-UNUSABLE ${w.display} ${s.line} (anonymous and title leaks or unusable)`);
    });
    if (w.collection && COLLECTIONS.includes(w.collection)) facts.push({ p: "work_collection", o: w.collection, src });
    if (w.part && SHIJING_PARTS.includes(w.part)) facts.push({ p: "work_part", o: w.part, src });
    const id = `pw-${h(`${norm(w.author)}|${norm(w.text).slice(0, 12)}`)}`;
    w.id = id;
    w.titleOk = titleOk;
    if (facts.length < 2) problems.push(`POETRY-WORK-THIN ${w.display} (${facts.map((f) => f.p).join(",")})`);
    cards.push({ id, book: "shi", kind: "work", name: w.display, author: w.author, dynasty: w.dynasty, era: w.era, anon: w.anon, titleKind: w.kind, titleOk, sharedWith: w.sharedWith || [], note: w.note, facts, srcIds: src, inGk: w.srcIds.has("recite-gk"), inMs: w.srcIds.has("recite-ms"), textbook: w.textbook });
    if (!w.anon) {
      const pk = norm(w.author);
      let p = poets.get(pk);
      if (!p) poets.set(pk, (p = { name: w.author, eras: new Set(), tbEras: new Set(), dynasties: new Set(), works: [], src: new Set() }));
      p.eras.add(w.era);
      if (w.textbook) p.tbEras.add(w.era);
      p.dynasties.add(w.dynasty);
      p.works.push(w);
      for (const s of src) p.src.add(s);
    }
  }
  const akaOf = new Map(C.poets.map((p) => [norm(p.name), p.aka || []]));
  for (const p of poets.values()) {
    const eras = p.tbEras.size ? p.tbEras : p.eras;
    if (eras.size !== 1) {
      problems.push(`POETRY-POET-ERA-AMBIGUOUS ${p.name} ${[...p.dynasties].join("/")}`);
      continue;
    }
    const era = [...eras][0];
    const src = [...p.src];
    const facts = [{ p: "poet_era", o: era, raw: [...p.dynasties].filter(Boolean).join("、"), src }];
    for (const a of akaOf.get(norm(p.name)) || []) {
      if (a.includes(p.name)) problems.push(`POETRY-AKA-LEAK ${p.name} ${a}`);
      else facts.push({ p: "poet_aka", o: a, src: ["curated-canon"] });
    }
    for (const w of p.works.filter((x) => x.titleOk).slice(0, 3)) facts.push({ p: "poet_work", o: w.display, src });
    const card = { id: `pp-${h(norm(p.name))}`, book: "shi", kind: "person", name: p.name, era, dynasties: [...p.dynasties].filter(Boolean), facts, works: p.works.length, gkWorks: p.works.filter((w) => w.srcIds.has("recite-gk")).length, aka: facts.filter((f) => f.p === "poet_aka").length, srcIds: src };
    if (facts.length < 2) problems.push(`POETRY-POET-FOLDED ${p.name} (${facts.length} fact)`);
    else cards.push(card);
  }
  for (const a of C.poets) if (!poets.has(norm(a.name))) problems.push(`POETRY-AKA-ORPHAN ${a.name}`);
  for (const g of C.groups) {
    const facts = g.members.map((m) => ({ p: "group_member", o: m, src: ["curated-canon"] }));
    cards.push({ id: `pg-${h(g.name)}`, book: "shi", kind: "group", name: g.name, groupKind: g.kind, members: g.members, pool: g.pool, facts, srcIds: ["curated-canon"] });
  }
  return cards;
}

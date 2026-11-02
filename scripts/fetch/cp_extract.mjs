#!/usr/bin/env node
// 雲山詩國課本外名篇的原文快照＋題名普查（風雅千載語料，chinese-poetry／Werneror，MIT）。
// 用法：node scripts/fetch/cp_extract.mjs [CP_CORPUS_DIR]（預設 /Users/ylsuen/CF/sites/chinese/cp/corpus）
// 1. data/curated/canon/shi.mjs 的 extra 名篇：課本快照、《唐詩三百首》《宋詞三百首》裡找得到的不另存；找不到的從語料原樣摘出。
// 2. 題名普查：每一首核心篇目的題名（去掉「其一」「二首」之類序號）在全部語料裡由幾位作者用過；同代或前代已有他人用過、
//    或語料把它歸在樂府類名之下的，就是通用題名，建置時不出「〈題名〉的作者是誰」。只寫 data/raw/chinese-poetry/canon-extra.json。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("../../", import.meta.url).pathname);
const CP = process.argv[2] || "/Users/ylsuen/CF/sites/chinese/cp/corpus";
const T2S = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/lib/t2s-chars.json"), "utf8")).map;
const norm = (s) => Array.from(String(s || "")).map((c) => T2S[c] || c).join("").replace(/[^\p{Script=Han}]/gu, "");
// 題名鍵：去掉括號說明、序號（其一、其五、二首、十首 一）、間隔號後的首句標記由呼叫端決定
export const titleKey = (t) =>
  norm(
    String(t || "")
      .replace(/[（(][^）)]*[）)]/g, "")
      .replace(/其[一二三四五六七八九十百〇零]+/g, "")
      .replace(/[一二三四五六七八九十百]+首/g, "")
      .replace(/\s+[一二三四五六七八九十百]+$/g, ""),
  );

const mod = (await import(path.join(ROOT, "data/curated/canon/shi.mjs"))).default;
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const textbook = [...rd("data/raw/recite/recite-ms.json").pieces, ...rd("data/raw/recite/recite-gk.json").pieces].filter((p) => p.kind === "shi").map((p) => ({ title: p.title, author: p.author, text: p.paras.map((x) => x.text).join("") }));
const anth = rd("data/raw/chinese-poetry/anthologies.json");
const tang = anth.tang300.map((p) => ({ title: p.title, author: p.author, text: p.paragraphs.join("") }));
const song = anth.song300.map((p) => ({ title: p.rhythmic, author: p.author, text: p.paragraphs.join("") }));

// 語料：〔編號〕題目｜作者｜附註 ＋ 正文
const sources = JSON.parse(fs.readFileSync(path.join(CP, "SOURCES.json"), "utf8"));
const records = [];
const files = [];
for (const era of fs.readdirSync(path.join(CP, "txt")).sort()) {
  for (const f of fs.readdirSync(path.join(CP, "txt", era)).sort()) {
    const rel = `txt/${era}/${f}`;
    files.push(rel);
    let cur = null;
    for (const line of fs.readFileSync(path.join(CP, rel), "utf8").split("\n")) {
      const m = line.match(/^〔(\d+)〕([^｜]*)｜([^｜]*)(?:｜(.*))?$/);
      if (m) {
        cur = { file: rel, id: +m[1], title: m[2], author: m[3], note: m[4] || "", lines: [] };
        records.push(cur);
      } else if (cur && line && !line.startsWith("#")) cur.lines.push(line);
    }
  }
}
for (const r of records) r.text = r.lines.join("");

const has = (p, by, q) => (!by || norm(p.author) === norm(by)) && norm(p.text).includes(norm(q));
const extracted = [];
const located = [];
for (const e of mod.extra) {
  const where = textbook.find((p) => has(p, e.by, e.q)) ? "textbook" : tang.find((p) => has(p, e.by, e.q)) ? "tang300" : song.find((p) => has(p, e.by, e.q)) ? "song300" : "";
  if (where) {
    located.push({ t: e.t, by: e.by || "", where });
    continue;
  }
  const hits = records.filter((r) => has(r, e.by, e.q));
  const pick = hits.find((r) => norm(r.title).includes(norm(e.t))) || hits[0];
  if (!pick) {
    located.push({ t: e.t, by: e.by || "", where: "MISSING" });
    continue;
  }
  located.push({ t: e.t, by: e.by || "", where: pick.file, id: pick.id, candidates: hits.length });
  extracted.push({ q: e.q, by: e.by || "", file: pick.file, id: pick.id, title: pick.title, author: pick.author, note: pick.note, lines: pick.lines });
}

// 題名普查：核心篇目（課本＋extra 找到的那一首）的題名鍵 → 用過這個題名的作者
const coreTitles = new Set();
for (const p of textbook) coreTitles.add(titleKey(p.title));
for (const e of mod.extra) coreTitles.add(titleKey(e.sub ? `${e.t}·${e.sub}` : e.t));
for (const p of [...tang, ...song]) if (mod.extra.some((e) => has(p, e.by, e.q))) coreTitles.add(titleKey(p.title));
for (const r of extracted) coreTitles.add(titleKey(r.title));
const census = {};
const add = (title, author, where) => {
  const k = titleKey(title);
  if (!coreTitles.has(k)) return;
  census[k] ||= {};
  const a = norm(author) || "佚名";
  (census[k][a] ||= new Set()).add(where);
};
for (const r of records) add(r.title, r.author, r.file.split("/")[1]);
for (const p of tang) add(p.title, p.author, "tang300");
for (const p of song) add(p.title, p.author, "song300");
for (const p of textbook) add(p.title, /^《.+》$/.test(p.author) ? "" : p.author, "textbook");
// 樂府題：語料（全唐詩）把同一題名歸在樂府類名之下（相和歌辭、雜曲歌辭……），這個題名就是樂府舊題，與詞牌一樣是通用題名
const YUEFU = /^(相和歌辭|雜曲歌辭|杂曲歌辞|相和歌辞|橫吹曲辭|横吹曲辞|郊廟歌辭|琴曲歌辭|近代曲辭|新樂府辭|雜歌謠辭|清商曲辭|舞曲歌辭|鼓吹曲辭|燕射歌辭)\s*(.+)$/;
const yuefu = new Set();
for (const r of records) {
  const m = r.title.match(YUEFU);
  if (m && coreTitles.has(titleKey(m[2]))) yuefu.add(titleKey(m[2]));
}
const titleAuthors = Object.fromEntries(Object.entries(census).sort().map(([k, v]) => [k, Object.fromEntries(Object.entries(v).sort().map(([a, w]) => [a, [...w].sort()]))]));

const out = {
  note: "雲山詩國課本外名篇原文（逐字照錄語料，未轉繁簡）與核心題名普查。題名普查：同一題名鍵在風雅千載全部語料、唐詩三百首、宋詞三百首、課本中出現的作者。",
  source: { corpus: "風雅千載 cp.bdfz.net corpus/txt", collections: sources.sources, files },
  poems: extracted,
  titleAuthors,
  yuefu: [...yuefu].sort(),
};
fs.writeFileSync(path.join(ROOT, "data/raw/chinese-poetry/canon-extra.json"), JSON.stringify(out, null, 1) + "\n");
const missing = located.filter((x) => x.where === "MISSING");
console.log(JSON.stringify({ records: records.length, extracted: extracted.length, located: located.length, missing, titles: Object.keys(titleAuthors).length, multi: located.filter((x) => x.candidates > 1).map((x) => `${x.t}:${x.candidates}`) }, null, 1));

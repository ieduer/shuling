#!/usr/bin/env node
// 萬國星海核對快照：把 data/curated/canon/ 的世界文學人物與作品解析成 Wikidata 實體，供建置核對作者（P50）、
// 成書年代（P577／P571）、國籍（P27）、人物（P674）與知名度（條目數）。
// 用法：node scripts/fetch/canon_wikidata.mjs CACHE_DIR
// - 人物：檢索英文名，取第一個是人（P31=Q5；傳說人物標 legend 時免此條）、英文描述含 hint（未給 hint 時含常見作家職業字）的候選。
// - 作品：檢索英文名，取第一個 P50 含本表作者 QID 的候選；作者不在本表時以諾貝爾官方資料的 QID 核對；無作者的作品看描述。
// - 每次請求間隔 1.1 秒，遇 429 依 Retry-After 退避；回應快取在 CACHE_DIR，重跑不重抓。只寫 data/raw/wikidata/canon.json（CC0）。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = path.resolve(new URL("../../", import.meta.url).pathname);
const CACHE = process.argv[2];
if (!CACHE) throw new Error("usage: canon_wikidata.mjs CACHE_DIR");
fs.mkdirSync(CACHE, { recursive: true });
const UA = { "User-Agent": "bdfz-shuling-build/0.3 (education project; https://shuling.bdfz.net)" };
const LANGS = "en|zh|zh-hant|zh-hans|zh-tw|zh-cn|ja";
const BOOKS = ["aegean", "rome", "east", "europe", "c19", "modern", "fusang"];
const WRITERISH = /writer|poet|novelist|playwright|dramatist|author|essayist|philosopher|historian|theologian|emperor|fabulist|storyteller|orator|statesman|critic|scholar|sage|mystic|translator|journalist|lyricist|haikai|rishi/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(params) {
  const key = createHash("sha1").update(JSON.stringify(params, Object.keys(params).sort())).digest("hex").slice(0, 20);
  const file = path.join(CACHE, `${key}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const url = "https://www.wikidata.org/w/api.php?" + new URLSearchParams({ ...params, format: "json" });
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: UA });
    if (r.status === 429 && attempt < 4) {
      await sleep(Math.min(Number(r.headers.get("retry-after")) || 30, 120) * 1000);
      continue;
    }
    if (!r.ok) throw new Error(`wikidata ${r.status} ${url}`);
    const data = await r.json();
    fs.writeFileSync(file, JSON.stringify(data));
    await sleep(1100);
    return data;
  }
}
async function entities(ids, props = "labels|descriptions|claims|sitelinks") {
  const out = {};
  const list = [...new Set(ids)].sort();
  for (let i = 0; i < list.length; i += 50) Object.assign(out, (await api({ action: "wbgetentities", ids: list.slice(i, i + 50).join("|"), props, languages: LANGS })).entities);
  return out;
}
const claims = (e, p) =>
  (e?.claims?.[p] || [])
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter(Boolean)
    .map((v) => (typeof v === "object" && v.id ? v.id : typeof v === "object" && v.time ? v.time : typeof v === "object" && v.text ? v.text : v));
const desc = (e) => (e?.descriptions?.en?.value || "").toLowerCase();
const slim = (e) => ({
  qid: e.id,
  labels: Object.fromEntries(Object.entries(e.labels || {}).map(([k, v]) => [k, v.value])),
  description_en: e.descriptions?.en?.value || "",
  sitelinks: Object.keys(e.sitelinks || {}).length,
  P31: claims(e, "P31"),
  P50: claims(e, "P50"),
  P27: claims(e, "P27"),
  P495: claims(e, "P495"),
  P569: claims(e, "P569"),
  P571: claims(e, "P571"),
  P577: claims(e, "P577"),
  P674: claims(e, "P674"),
});

async function search(text, limit = 10) {
  const hits = (await api({ action: "wbsearchentities", search: text, language: "en", type: "item", limit: String(limit) })).search || [];
  return hits.map((h) => h.id);
}

// 諾貝爾得主：nobel.tsv 的中文名 → 官方英文名 → 官方資料裡的 Wikidata QID
const nobelQid = new Map();
{
  const laureates = JSON.parse(fs.readFileSync(path.join(ROOT, "data/raw/nobel/laureates-lit.json"), "utf8")).laureates;
  const byEn = new Map(laureates.map((l) => [String(l.knownName?.en || "").trim(), l.wikidata?.id]));
  for (const line of fs.readFileSync(path.join(ROOT, "data/curated/nobel.tsv"), "utf8").split("\n")) {
    if (!line || line.startsWith("#") || line.startsWith("year")) continue;
    const [, en, name] = line.split("\t");
    if (byEn.get(en)) nobelQid.set(name, byEn.get(en));
  }
}

const out = { fetched: new Date().toISOString().slice(0, 10), source: "https://www.wikidata.org/w/api.php (wbsearchentities, wbgetentities, query/search)", license: "CC0", people: {}, works: {}, aux_labels: {}, problems: [] };
for (const book of BOOKS) {
  const mod = (await import(path.join(ROOT, `data/curated/canon/${book}.mjs`))).default;
  const qidOf = new Map();
  for (const p of mod.people) {
    const ids = await search(p.en);
    const ents = ids.length ? await entities(ids) : {};
    const need = (p.hint || "").toLowerCase();
    const pick = ids.find((id) => (p.legend || claims(ents[id], "P31").includes("Q5")) && (need ? desc(ents[id]).includes(need) || (ents[id].labels?.en?.value || "").toLowerCase().includes(need) : WRITERISH.test(desc(ents[id]))));
    if (!pick) {
      out.problems.push(`PERSON-UNRESOLVED ${book}:${p.id} (${p.en})`);
      continue;
    }
    qidOf.set(p.id, pick);
    out.people[`${book}:${p.id}`] = slim(ents[pick]);
  }
  for (const w of mod.works) {
    const authorQ = w.by ? qidOf.get(w.by) || nobelQid.get(w.by) : null;
    if (w.by && !authorQ) out.problems.push(`WORK-AUTHOR-UNRESOLVED ${book}:${w.id} (${w.by})`);
    const ids = await search(w.en);
    let ents = ids.length ? await entities(ids) : {};
    const need = (w.hint || "").toLowerCase();
    let pick = authorQ
      ? ids.find((id) => claims(ents[id], "P50").includes(authorQ))
      : ids.find((id) => !claims(ents[id], "P31").includes("Q5") && (!need || desc(ents[id]).includes(need)) && /epic|poem|poetry|collection|text|book|tale|stories|scripture|anthology|hymns|chronicle|work|bible|veda|tales|nights|saga/.test(desc(ents[id])));
    // 書名太常見時，改以「作者＝本表作者」的全文檢索找作品
    if (!pick && authorQ) {
      const found = ((await api({ action: "query", list: "search", srsearch: `haswbstatement:P50=${authorQ} ${w.en.replace(/[^\p{L}\p{N}\s'-]/gu, " ")}`, srlimit: "10" })).query?.search || []).map((x) => x.title);
      if (found.length) {
        const more = await entities(found);
        ents = { ...ents, ...more };
        pick = found.find((id) => claims(more[id], "P50").includes(authorQ));
      }
    }
    if (!pick) {
      out.problems.push(`WORK-UNRESOLVED ${book}:${w.id} (${w.en}${authorQ ? `; author ${authorQ}` : ""})`);
      continue;
    }
    const rec = slim(ents[pick]);
    rec.author_qid = authorQ || "";
    // 人物：P674 的英文標籤與本表英文名比對（寬鬆：任一方包含另一方的主要字）
    if (w.chars?.length && rec.P674.length) {
      const ce = await entities(rec.P674, "labels");
      const names = rec.P674.map((q) => (ce[q]?.labels?.en?.value || "").toLowerCase());
      rec.chars = Object.fromEntries(
        w.chars.map(([zh, en]) => {
          const key = String(en || "").toLowerCase().replace(/[^a-z\s'-]/g, "").trim();
          const core = key.split(/\s+/).filter((t) => t.length > 2 && !["the", "mr", "mrs", "miss", "captain", "prince", "dr"].includes(t));
          return [zh, names.some((n) => n && (n.includes(key) || key.includes(n) || core.some((t) => n.split(/\s+/).includes(t))))];
        }),
      );
    }
    out.works[`${book}:${w.id}`] = rec;
  }
}
const aux = new Set();
for (const v of Object.values(out.people)) for (const q of v.P27) aux.add(q);
for (const v of Object.values(out.works)) for (const q of v.P495) aux.add(q);
const auxEnts = await entities([...aux], "labels");
out.aux_labels = Object.fromEntries(Object.entries(auxEnts).map(([q, e]) => [q, Object.fromEntries(Object.entries(e.labels || {}).map(([k, v]) => [k, v.value]))]));
fs.writeFileSync(path.join(ROOT, "data/raw/wikidata/canon.json"), JSON.stringify(out, null, 0) + "\n");
console.log(JSON.stringify({ people: Object.keys(out.people).length, works: Object.keys(out.works).length, problems: out.problems }, null, 1));

// 諾貝爾星河：官方得主資料＋Wikidata（寫作語言、代表作、條目數）＋本站譯名與授獎辭提要表 → 卡與事實。
import fs from "node:fs";
import path from "node:path";

// 授獎辭分析的五期（_meta/reports/operations/shuling-design-20261031/NOBEL_CITATIONS_ANALYSIS.md）
export const PHASES = [
  { id: "sublime", label: "崇高", from: 1901, to: 1919 },
  { id: "land", label: "土地", from: 1920, to: 1939 },
  { id: "humane", label: "人道", from: 1944, to: 1969 },
  { id: "condition", label: "處境", from: 1970, to: 1999 },
  { id: "witness", label: "見證", from: 2000, to: 2100 },
];
export const phaseOf = (year) => PHASES.find((p) => year >= p.from && year <= p.to);

const clean = (s) => String(s || "").replace(/<\/?[iI]>/g, "").replace(/&([a-z]+);/g, (m, e) => ({ ccedil: "ç", eacute: "é", amp: "&" })[e] || m).replace(/\s+/g, " ").trim();
const zhLabel = (lab = {}) => lab["zh-hant"] || lab["zh-tw"] || lab["zh-hk"] || lab.zh || "";
// 同一語言的變體標籤歸一，免得「英國英語」當干擾項卻與正解「英語」同義；原標籤留在 raw 寫進解析。
const LANG_NORMAL = { 英國英語: "英語", 加拿大英語: "英語", 美國英語: "英語", 官話: "中文", 現代希臘語: "希臘語", 新挪威語: "挪威語" };

export function loadNobel(root, problems) {
  const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
  const prizes = rd("data/raw/nobel/prizes-lit.json").nobelPrizes;
  const laureates = new Map(rd("data/raw/nobel/laureates-lit.json").laureates.map((l) => [l.id, l]));
  const wd = rd("data/raw/wikidata/nobel-lit-laureates.json");
  const rows = fs
    .readFileSync(path.join(root, "data/curated/nobel.tsv"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .slice(1)
    .map((l) => {
      const [year, en, name, name_tw, kw, kw_zh, work_qid, work, work_tw] = l.split("\t").map((x) => (x === "-" ? "" : x));
      return { year: +year, en, name, name_tw, kw, kw_zh, work_qid, work, work_tw };
    });
  const curated = new Map(rows.map((r) => [`${r.year}|${r.en}`, r]));

  const cards = [];
  for (const prize of prizes) {
    const year = +prize.awardYear;
    for (const pl of prize.laureates || []) {
      const en = clean(pl.knownName?.en);
      const cur = curated.get(`${year}|${en}`);
      if (!cur) {
        problems.push(`NOBEL-UNCURATED ${year} ${en}`);
        continue;
      }
      curated.delete(`${year}|${en}`);
      const motivation = clean(pl.motivation?.en);
      if (!motivation.toLowerCase().includes(cur.kw.toLowerCase())) problems.push(`NOBEL-KW-NOT-VERBATIM ${year} ${en}: "${cur.kw}"`);
      const person = laureates.get(pl.id) || {};
      const qid = person.wikidata?.id;
      // 官方資料給 Le Clézio 的 Wikidata 編號指向一封信而不是作者本人；條目數不到 10 的一律視為錯配，不採用。
      const w = qid && wd.laureates[qid] && wd.laureates[qid].sitelinks >= 10 ? wd.laureates[qid] : null;
      if (qid && !w) problems.push(`NOBEL-WIKIDATA-MISMATCH ${year} ${en} ${qid} (ignored)`);
      const langIds = w ? (w.P6886.length ? w.P6886 : w.P1412) : [];
      const rawLangs = langIds.map((id) => zhLabel(wd.aux_labels[id])).filter(Boolean);
      const langs = [...new Set(rawLangs.map((l) => LANG_NORMAL[l] || l))];
      const phase = phaseOf(year);
      const facts = [
        { p: "nobel_year", o: String(year), src: ["nobel-api", "curated-nobel"] },
        { p: "citation_kw", o: cur.kw, label: cur.kw_zh, src: ["nobel-api", "curated-nobel"] },
      ];
      if (cur.work_qid) {
        if (!w || !w.P800.includes(cur.work_qid)) problems.push(`NOBEL-WORK-NOT-IN-P800 ${year} ${en} ${cur.work_qid}`);
        else facts.push({ p: "notable_work", o: cur.work, alt: cur.work_tw, qid: cur.work_qid, src: ["wikidata", "curated-nobel"] });
      }
      if (langs.length === 1) facts.push({ p: "writing_lang", o: langs[0], raw: rawLangs.join("、"), src: ["wikidata"] });
      cards.push({
        id: `nb-${year}-${en.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 16)}`,
        book: "nobel",
        kind: "person",
        name: cur.name,
        alt: cur.name_tw,
        en,
        year,
        phase,
        langs,
        motivation,
        url: person.wikipedia?.english || "https://www.nobelprize.org/prizes/literature/",
        prominence: w ? w.sitelinks : null,
        qid: w ? qid : null,
        group: phase.id,
        order: year,
        facts,
      });
    }
  }
  for (const k of curated.keys()) problems.push(`NOBEL-CURATED-UNUSED ${k}`);
  return cards;
}

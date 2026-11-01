// 來源登記表：事實只能引用這裡登記過的來源，否則建置失敗（設計方案 §5.2、§10）。
// file 是專案內的快照；建置時計算 sha256 寫進 BUILD-REPORT，快照一改，題庫版本就跟著變。
export const SOURCES = {
  "nobel-api": {
    label: "諾貝爾獎官方資料（nobelprize.org API 2.1，2026-10-31 讀取）",
    url: "https://www.nobelprize.org/prizes/lists/all-nobel-prizes-in-literature/",
    role: "official",
    files: ["data/raw/nobel/prizes-lit.json", "data/raw/nobel/laureates-lit.json"],
  },
  wikidata: {
    label: "Wikidata（CC0，2026-10-31 讀取）",
    url: "https://www.wikidata.org/",
    role: "structured",
    files: ["data/raw/wikidata/nobel-lit-laureates.json"],
  },
  "curated-nobel": {
    label: "書靈諾貝爾譯名與授獎辭提要表",
    role: "editorial",
    files: ["data/curated/nobel.tsv"],
  },
  "wikidata-world": {
    label: "Wikidata（CC0）：古希臘、古羅馬、日本作家與作品",
    url: "https://www.wikidata.org/",
    role: "structured",
    files: ["data/raw/wikidata/world-lit.json"],
  },
  "curated-world": {
    label: "書靈萬國譯名表（大陸／臺灣譯名）",
    role: "editorial",
    files: ["data/curated/world.tsv"],
  },
  "cp-anthologies": {
    label: "《唐詩三百首》《宋詞三百首》（chinese-poetry b8594f8，MIT）",
    url: "https://github.com/chinese-poetry/chinese-poetry",
    role: "textbook",
    files: ["data/raw/chinese-poetry/anthologies.json"],
  },
  "tw-exams": {
    label: "指考國文試題與官方答案（大學入學考試中心；經 tw.bdfz.net 校對）",
    url: "https://www.ceec.edu.tw/",
    role: "exam",
    files: ["data/raw/exams/tw-literature.json"],
  },
  "recite-ms": {
    label: "琅琅·初中古詩文（統編語文七上至九下，原文按教材核對）",
    url: "https://recite.rdfz.net/",
    role: "textbook",
    files: ["data/raw/recite/recite-ms.json"],
  },
  "recite-gk": {
    label: "琅琅·高考背誦篇目",
    url: "https://recite.bdfz.net/",
    role: "textbook",
    files: ["data/raw/recite/recite-gk.json"],
  },
};

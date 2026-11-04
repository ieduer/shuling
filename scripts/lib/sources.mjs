// 來源登記表：事實只能引用這裡登記過的來源，否則建置失敗（設計方案 §5.2、§10）。
// file 是專案內的快照；建置時計算 sha256 寫進 BUILD-REPORT，快照一改，題庫版本就跟著變。
const CANON = ["shi", "wen", "shuo", "xin", "aegean", "rome", "east", "europe", "c19", "modern", "fusang", "schools"].map((b) => `data/curated/canon/${b}.mjs`);
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
  "curated-canon": {
    label: "書靈核心經典表（依通行文學史編寫：名句逐字核對原文，世界文學作者與年代經 Wikidata 核對）",
    role: "editorial",
    files: CANON,
  },
  "wikidata-canon": {
    label: "Wikidata（CC0，2026-11-01 讀取）：世界文學作家、作品、成書年代與人物",
    url: "https://www.wikidata.org/",
    role: "structured",
    files: ["data/raw/wikidata/canon.json"],
  },
  "cp-anthologies": {
    label: "《唐詩三百首》《宋詞三百首》（chinese-poetry b8594f8，MIT）",
    url: "https://github.com/chinese-poetry/chinese-poetry",
    role: "textbook",
    files: ["data/raw/chinese-poetry/anthologies.json"],
  },
  "cp-corpus": {
    label: "風雅千載語料（chinese-poetry b8594f8、Werneror 4cfe49c，MIT）：課本外名篇原文與題名普查",
    url: "https://cp.bdfz.net/",
    role: "textbook",
    files: ["data/raw/chinese-poetry/canon-extra.json"],
  },
  "tw-exams": {
    label: "指考國文試題與官方答案（大學入學考試中心；經 tw.bdfz.net 校對）",
    url: "https://www.ceec.edu.tw/",
    role: "exam",
    files: ["data/raw/exams/tw-literature.json"],
  },
  "tw-exam-figures": {
    label: "指考國文原卷附圖（大學入學考試中心公告原卷 PDF，照原樣裁切）",
    url: "https://www.ceec.edu.tw/",
    role: "figure",
    files: ["data/raw/exams/tw-figures.json", "public/assets/exam/v1/tw-93-6.png", "public/assets/exam/v1/tw-96-11.png", "scripts/fetch/exam_figures.mjs"],
  },
  "bj-exams": {
    label: "北京卷語文試題與參考答案（高考站 gk.bdfz.net 答案核查表；學習參考，原考試機構答案出版鏈未證實）",
    url: "https://gk.bdfz.net/",
    role: "exam",
    files: ["data/raw/exams/bj-literature.json"],
  },
  "recite-ms": {
    label: "琅琅·初中古詩文（統編語文七上至九下全部 124 篇，原文按教材核對）",
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

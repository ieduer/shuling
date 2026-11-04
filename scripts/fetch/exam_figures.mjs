#!/usr/bin/env node
// 真卷殿·指考附圖：從大考中心公告的原卷 PDF 裁出題目必需的附圖，寫 public/assets/exam/v1/*.png 與 data/raw/exams/tw-figures.json。
// 用法：node scripts/fetch/exam_figures.mjs [CEEC_DIR]（預設 /Users/ylsuen/CF/_scratch/ceec-zhikao，即 2026-09-27 全量下載的大考中心指考檔案庫，manifest.json 有每檔 SHA-256）
// 規則（每條都必須成立，否則整批失敗、不寫輸出）：
// - 原卷 PDF 的 SHA-256 必須等於檔案庫 manifest 登記的值，且官方網址與題目快照 source_file 相同；
// - 只裁下表逐題審過的區域（頁碼、PDF 點座標、解析度），照原卷原樣，不修圖、不加字；
// - 只收「沒有附圖就無法作答」的題（選項只有「原卷圖示……（見圖）」或題幹寫「如附圖」）；build-bank 會反查：題文提到圖而沒有附圖即建置失敗。
// 著作權：試題為大考中心公告之考試試題；93 學年第 6 題的四個選項是古代碑帖書跡，96 學年第 11 題是潘天壽（1897–1971）1959 年作品，
// 臺灣與中國大陸著作財產權存續期間皆為作者終身加 50 年，2021 年底屆滿。每張圖都標原卷出處。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = path.resolve(new URL("../../", import.meta.url).pathname);
const CEEC = process.argv[2] || "/Users/ylsuen/CF/_scratch/ceec-zhikao";
const OUT_DIR = "public/assets/exam/v1";
// box：[x, y, w, h]（PDF 點，原點左上）；gray：原圖為灰階水墨，存灰階檔
const FIGURES = [
  {
    id: "tw-93-6",
    pdf: "files/93-指定科目考試/國文/93chinese.pdf",
    page: 3,
    box: [70, 134, 430, 82],
    dpi: 200,
    gray: false,
    alt: "原卷四個選項的書法圖例 (A)–(D)：四段碑帖字跡，各代表一種書體",
    caption: "原卷選項圖示 (A)–(D)，大學入學考試中心 93 學年度指定科目考試國文考科第 3 頁",
  },
  {
    id: "tw-96-11",
    pdf: "files/96-指定科目考試/國文/01-96指考國文定稿.pdf",
    page: 4,
    box: [117, 208, 391, 193],
    dpi: 200,
    gray: true,
    alt: "潘天壽「誠齋詩意」水墨畫：細長水草、幾片圓葉與一隻停駐的蜻蜓，右上題「誠齋詩意」",
    caption: "原卷附圖：潘天壽「誠齋詩意」（1959），大學入學考試中心 96 學年度指定科目考試國文考科第 4 頁",
  },
];

const sha = (b) => createHash("sha256").update(b).digest("hex");
const fail = (m) => {
  console.error(`exam_figures: ${m} (nothing written)`);
  process.exit(1);
};
const manifest = JSON.parse(fs.readFileSync(path.join(CEEC, "manifest.json"), "utf8"));
const listed = new Map(manifest.files.map((f) => [f.path, f]));
const exams = JSON.parse(fs.readFileSync(path.join(ROOT, "data/raw/exams/tw-literature.json"), "utf8"));
const items = new Map(exams.questions.map((q) => [q.id, q]));

const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "shuling-fig-"));
const out = [];
try {
  for (const F of FIGURES) {
    const q = items.get(F.id);
    if (!q) fail(`${F.id} not in tw-literature.json`);
    if (!/見圖|附圖/.test(q.stem + q.options.map((o) => o.text).join(""))) fail(`${F.id} does not refer to a figure`);
    const entry = listed.get(F.pdf);
    if (!entry) fail(`${F.pdf} not in manifest`);
    const buf = fs.readFileSync(path.join(CEEC, F.pdf));
    if (sha(buf) !== entry.sha256) fail(`${F.pdf} sha256 differs from manifest`);
    if (decodeURIComponent(entry.url) !== decodeURIComponent(q.source_file)) fail(`${F.id} source_file ${q.source_file} != manifest url ${entry.url}`);
    const s = F.dpi / 72;
    const [x, y, w, h] = F.box.map((v) => Math.round(v * s));
    const base = path.join(tmp, F.id);
    execFileSync("pdftoppm", ["-r", String(F.dpi), "-f", String(F.page), "-l", String(F.page), "-x", String(x), "-y", String(y), "-W", String(w), "-H", String(h), ...(F.gray ? ["-gray"] : []), "-png", "-singlefile", path.join(CEEC, F.pdf), base]);
    const png = fs.readFileSync(`${base}.png`);
    const file = `${OUT_DIR}/${F.id}.png`;
    out.push({ F, png, rec: { id: F.id, file, src: `/assets/exam/v1/${F.id}.png`, sha256: sha(png), bytes: png.length, width: w, height: h, alt: F.alt, caption: F.caption, pdf_url: entry.url, pdf_sha256: entry.sha256, page: F.page, box_pt: F.box, dpi: F.dpi, gray: F.gray } });
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
fs.mkdirSync(path.join(ROOT, OUT_DIR), { recursive: true });
for (const { png, rec } of out) fs.writeFileSync(path.join(ROOT, rec.file), png);
const tool = execFileSync("pdftoppm", ["-v"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() || "";
fs.writeFileSync(
  path.join(ROOT, "data/raw/exams/tw-figures.json"),
  JSON.stringify({ source: "大學入學考試中心公告之指定科目考試國文考科原卷 PDF（本機檔案庫 _scratch/ceec-zhikao，manifest SHA-256 核對）", note: "只收沒有附圖就無法作答的題；照原卷原樣裁切，不修圖", renderer: tool.split("\n")[0] || "pdftoppm", figures: Object.fromEntries(out.map(({ rec }) => [rec.id, rec])) }, null, 1) + "\n",
);
for (const { rec } of out) console.log(`${rec.id} ${rec.file} ${rec.width}x${rec.height} ${rec.bytes} B ${rec.sha256.slice(0, 12)}`);

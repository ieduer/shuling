// 「我的」頁在 Windows Edge 上變純色（2026-10-28 用戶中心回報）：唯一有巢狀 backdrop-filter 的頁面，外加八枚帶 drop-shadow 濾鏡的徽章與
// 逐格重畫陰影的輝光動畫。這些閘門擋住回退：統計格不再套第二層 backdrop-filter、徽章不用 filter: drop-shadow、輝光只動透明度、
// 每一頁都包在錯誤邊界裡、存檔的卡片表讀取要防呆。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = ["src/styles/index.css", "src/styles/screens.css", "src/styles/game.css"].map((p) => [p, read(p)]);
const blocks = (text) => {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text))) out.push({ selector: m[1].trim().replace(/\/\*[\s\S]*?\*\//g, "").trim(), body: m[2].replace(/\/\*[\s\S]*?\*\//g, "") });
  return out;
};

test("統計格（.me-stats li／.home-stats li）不再在毛玻璃卡片裡再套 backdrop-filter", () => {
  for (const [p, text] of css) for (const b of blocks(text)) if (/\.(me|home)-stats li/.test(b.selector)) assert.doesNotMatch(b.body, /backdrop-filter/, p + " " + b.selector);
});

test("徽章（.emblem）不用 filter: drop-shadow，陰影與金光都是 box-shadow", () => {
  let seen = 0;
  for (const [p, text] of css) for (const b of blocks(text)) if (/(^|[\s,])\.emblem(?![\w-])/.test(" " + b.selector) || /\.rank \.emblem|\.ladder-row \.emblem(?! img)/.test(b.selector)) { seen++; assert.doesNotMatch(b.body, /drop-shadow/, p + " " + b.selector); }
  assert(seen >= 2, "emblem rules not found");
  const index = read("src/styles/index.css");
  assert.match(index, /\.emblem img \{[^}]*box-shadow:/, "medallion depth must be a box-shadow on the round image");
});

test("文曲輝光動畫只動透明度（不逐格重畫 box-shadow）", () => {
  const index = read("src/styles/index.css");
  const kf = index.match(/@keyframes emblem-shine \{([\s\S]*?)\n\}/);
  assert(kf, "emblem-shine keyframes missing");
  assert.match(kf[1], /opacity/);
  assert.doesNotMatch(kf[1], /box-shadow/);
  assert.match(index, /\.emblem-8::after \{[^}]*animation: emblem-shine/, "the shine rides on a ring pseudo-element");
  assert.doesNotMatch(index, /\.emblem-8 img \{[^}]*animation/, "no animation on the image itself");
});

test("每一頁都包在錯誤邊界裡，崩潰時只換掉該頁、不動存檔", () => {
  const app = read("src/App.tsx");
  assert.match(app, /<ErrorBoundary/);
  assert(app.indexOf("<ErrorBoundary") < app.indexOf("<Battle") && app.indexOf("</ErrorBoundary>") > app.indexOf("<Me />"), "boundary must wrap every screen");
  const eb = read("src/components/ErrorBoundary.tsx");
  assert.match(eb, /static getDerivedStateFromError/);
  assert.match(eb, /window\.location\.reload\(\)/);
  assert.doesNotMatch(eb, /localStorage|resetProgress/, "the boundary never touches the save");
});

test("存檔卡片表讀取防呆（舊版或手改存檔不能讓整頁空白）", () => {
  assert.match(read("src/screens/Me.tsx"), /Object\.values\(p\.cards \|\| \{\}\)/);
  assert.match(read("src/lib/sync.ts"), /Object\.values\(p\.cards \|\| \{\}\)/);
});

test("底部導航欄近乎不透明並有上緣漸層遮罩（首屏被截的面板淡出，不透出半張）", () => {
  const index = read("src/styles/index.css");
  assert.match(index, /\.nav \{[^}]*linear-gradient\(180deg, var\(--nav-a\), var\(--nav-b\)\)/, "nav body must be fully opaque");
  assert.match(index, /\.screen \{[^}]*\+ 48px\)/, "content must clear the bar by 48px at the end of the page");
  assert.match(index, /\.nav::before \{[^}]*bottom: 100%[^}]*linear-gradient\(180deg, transparent/, "fade band above the nav"); assert.match(index, /\.nav::before \{[^}]*height: 48px[^}]*transparent, var\(--nav-a\)\)/, "fade band ends in the solid nav colour");
});

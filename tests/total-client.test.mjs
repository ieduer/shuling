// 六靈總榜（2026-11-20，sixling-total-20261120）：排行榜「六靈」分頁讀靈山的 /api/total（六站段位相加；本站資料庫與 Worker 不動）。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("六靈分頁：本站鍵、跨站讀 ling.bdfz.net（帶 cookie、不加自訂標頭，免預檢）", () => {
  const t = read("src/engine/total.ts");
  assert.match(t, /export const HERE = "shuling";/);
  assert.match(t, /"https:\/\/ling\.bdfz\.net\/api\/total"/);
  assert.match(t, /credentials: "include", headers: \{ accept: "application\/json" \}/);
  assert.doesNotMatch(t, /content-type/i);
  const b = read("src/screens/Board.tsx");
  assert.match(b, /\{ id: "total", label: "六靈"/);
  assert.match(b, /<TotalBoard \/>/);
  assert.match(b, /if \(period === "total"\) return;/);
  assert.match(read("src/styles/screens.css"), /\.total-seals img\.is-empty/);
});

test("段位徽章用各站自己的真圖（不是文字章）", () => {
  const tb = read("src/screens/TotalBoard.tsx");
  assert.match(tb, /src=\{`\$\{s\.art\}\/rank-\$\{x\[0\] \+ 1\}\.webp`\}/);
  assert.match(tb, /src=\{`\$\{s\.art\}\/logo\.webp`\}/);
});

test("本站 Worker 沒有六靈總榜端點（彙總只在靈山）", () => {
  assert.doesNotMatch(read("worker/index.ts"), /api\/total/);
});

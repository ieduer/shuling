// 六靈總榜（2026-11-20，sixling-total-20261120）：排行榜「六靈」分頁讀靈山的 /api/total（六站段位相加；本站資料庫不動）。
// 2026-11-21（sixling-anon-20261121）：沒登入的玩家也上榜，頁面送 meKey（本站 pid 的加鹽雜湊）認自己。
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

test("沒登入的人送 meKey＝SHA-256(\"sixling-me:\" + 本站 pid) 前 24 字元，不送 pid 本身", () => {
  const t = read("src/engine/total.ts");
  assert.match(t, /import \{ apiEnabled, fetchMe \} from "\.\/api";/);
  assert.match(t, /encode\("sixling-me:" \+ me\.pid\)/);
  assert.match(t, /\.slice\(0, 24\)/);
  assert.match(t, /"me=" \+ key/);
  assert.doesNotMatch(t, /me=" \+ me\.pid|pid=/);
  const tb = read("src/screens/TotalBoard.tsx");
  assert.match(tb, /沒登入的玩家只計所在那一站/);
  assert.match(tb, /is-anon/);
});

// 書靈在用戶中心是記錄模式（2026-11-01 登記，SITE_REGISTRY shuling，blocked_missing_adapter，與 fuzi 相同）：
// 載入共用身分 SDK、只寫進度快照；不寫逐局事件、不報精通（要等可信轉接器另案）。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("UC_REGISTERED 為 true，站點鍵是 shuling", () => {
  const src = read("src/lib/identity.ts");
  assert.match(src, /export const UC_REGISTERED = true;/);
  assert.match(src, /export const SITE_KEY = "shuling";/);
});

test("index.html 載入 my.bdfz.net/site-auth.js（浮動導航件由 CSS 隱藏）", () => {
  assert.match(read("index.html"), /<script src="https:\/\/my\.bdfz\.net\/site-auth\.js" defer/);
  assert.match(read("src/styles/index.css"), /#bdfz-unified-widget \{\s*display: none !important;/);
});

test("記錄模式：只寫進度快照，不寫事件、不報精通", () => {
  const sync = read("src/lib/sync.ts");
  assert.match(sync, /syncProgress\(/);
  assert.doesNotMatch(sync, /recordEvent\(|reportMastery\(/);
  for (const f of ["src/App.tsx", "src/screens/Result.tsx", "src/screens/Battle.tsx", "src/screens/Me.tsx", "src/lib/cloud.ts"]) {
    assert.doesNotMatch(read(f), /recordEvent\(|reportMastery\(/, f);
  }
});

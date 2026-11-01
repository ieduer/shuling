// 書靈未在用戶中心註冊前，客戶端不得讀寫用戶中心；頁面也不載入用戶中心導航件。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("UC_REGISTERED 為 false，且每個用戶中心呼叫都先檢查它", () => {
  const src = read("src/lib/identity.ts");
  assert.match(src, /export const UC_REGISTERED = false;/);
  for (const fn of ["userCenterApi", "getSession", "logout", "syncProgress", "recordEvent", "reportMastery"]) {
    const body = src.slice(src.indexOf(`function ${fn}(`)).split("\n").slice(0, 3).join("\n");
    assert.match(body, /if \(!UC_REGISTERED\) return/, fn);
  }
});

test("index.html 不載入 my.bdfz.net/site-auth.js", () => {
  assert.ok(!/<script[^>]+my\.bdfz\.net\/site-auth\.js/.test(read("index.html")));
});

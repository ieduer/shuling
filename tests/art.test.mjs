// 真圖素材閘門：src/engine/art.ts 登記的每一張圖都必須真的存在於 public/，且不是 SVG；圖標類要有透明通道。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = readFileSync(path.join(root, "src", "engine", "art.ts"), "utf8");
const dir = src.match(/export const ART = "([^"]+)"/)[1];
const names = new Set();
for (const m of src.matchAll(/\$\{ART\}\/([a-zA-Z0-9-]+)\.webp/g)) names.add(m[1]);
for (const m of src.matchAll(/\$\{ART\}\/rank-\$\{i\}\.webp/g)) for (let i = 1; i <= 12; i++) names.add(`rank-${i}`); // 十二階（v2.9 題海四階）

test("art.ts 登記了完整的素材集", () => {
  assert.ok(names.size >= 55, `只找到 ${names.size} 張`);
  for (const must of ["logo", "dial", "nav-home", "nav-journey", "nav-board", "nav-codex", "nav-me", "gem-N", "gem-SSR", "map-shi", "map-nobel", "bg-home", "bg-battle", "candle", "mana", "star", "crown", "cardback", "node-off", "node-clear", "beast-n-silverfish", "beast-ssr-tianlu"]) {
    assert.ok(names.has(must), `缺 ${must}`);
  }
});

function webpHasAlpha(buf) {
  // VP8X 擴充標頭的 alpha 位元，或 VP8L 無損格式（可帶 alpha）
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") return (buf[20] & 0x10) !== 0;
  return chunk === "VP8L";
}

for (const n of [...names].sort()) {
  test(`素材存在且非 SVG：${n}.webp`, () => {
    const p = path.join(root, "public", dir, `${n}.webp`);
    assert.ok(existsSync(p), `缺檔 ${p}`);
    const st = statSync(p);
    assert.ok(st.size > 2000, `${n} 太小（${st.size} B）`);
    assert.ok(st.size < 400 * 1024, `${n} 太大（${st.size} B）`);
    const buf = readFileSync(p);
    assert.equal(buf.toString("ascii", 0, 4), "RIFF", `${n} 不是 WebP`);
    const needsAlpha = /^(logo|dial|nav-|rank-|gem-|candle|mana|star|crown|node-|skill-|beast-)/.test(n);
    if (needsAlpha) assert.ok(webpHasAlpha(buf), `${n} 應有透明通道`);
  });
}

test("PWA 圖標與 favicon 是 PNG", () => {
  for (const n of ["icon-32", "icon-180", "icon-192", "icon-512", "icon-maskable-512"]) {
    const p = path.join(root, "public", dir, `${n}.png`);
    assert.ok(existsSync(p), `缺 ${n}.png`);
    assert.equal(readFileSync(p).toString("ascii", 1, 4), "PNG");
  }
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(!/favicon\.svg/.test(html), "index.html 不應再引用 favicon.svg");
  assert.ok(/icon-180\.png/.test(html), "index.html 要有 apple-touch-icon PNG");
});

test("沒有剩下的舊站名", () => {
  for (const f of ["src/lib/sync.ts", "wrangler.toml", "index.html", "public/site.webmanifest"]) {
    assert.ok(!readFileSync(path.join(root, f), "utf8").includes("文言詞陣"), `${f} 仍含舊站名`);
  }
});

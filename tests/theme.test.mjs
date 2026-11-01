// 色系對比度閘門：每套色系的文字色對底色／面板色 ≥ 4.5:1，填色上的文字 ≥ 4.5:1。
// 只讀 src/styles/index.css 的 token 區塊；量不到的（rgba 漸層）由瀏覽器逐路由量測補足。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(here, "..", "src", "styles", "index.css"), "utf8");

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
const base = tokens(rootBlock);
const themes = {};
for (const m of css.matchAll(/html\[data-theme="([a-z]+)"\]\s*\{([\s\S]*?)\n\}/g)) themes[m[1]] = { ...base, ...tokens(m[2]) };

function hex(v) {
  const m = v && v.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function lum([r, g, b]) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const TEXT = ["text", "text-2", "muted", "paper", "gold", "gold-2", "cinnabar-2", "jade-2", "azure", "violet", "good", "bad"];
const SURFACE = ["bg", "bg-top", "bg-mid", "ink-2", "ink-3", "panel", "panel-2", "sheet-a", "sheet-b", "toast-bg", "nav-b"];
const FILLS = [
  ["on-gold", "gold-fill"],
  ["on-jade", "jade"],
  ["on-cinnabar", "cinnabar"],
  ["danger-text", "danger-bg"],
  ["card-text", "card-a"],
  ["card-text", "card-b"],
];

test("四套色系都存在", () => {
  assert.deepEqual(Object.keys(themes).sort(), ["celadon", "indigo", "ink", "paper"]);
});

for (const [name, t] of Object.entries(themes)) {
  test(`${name}：文字色對每個底色 ≥ 4.5:1`, () => {
    const bad = [];
    for (const s of SURFACE) {
      const bg = hex(t[s]);
      assert.ok(bg, `${name} --${s} 必須是不透明 hex（量測才可判定）：${t[s]}`);
      for (const k of TEXT) {
        const fg = hex(t[k]);
        assert.ok(fg, `${name} --${k} 必須是 hex：${t[k]}`);
        const r = ratio(fg, bg);
        if (r < 4.5) bad.push(`--${k} on --${s} = ${r.toFixed(2)}`);
      }
    }
    assert.deepEqual(bad, [], `${name} 低對比：\n${bad.join("\n")}`);
  });
  test(`${name}：填色上的文字 ≥ 4.5:1`, () => {
    const bad = [];
    for (const [fgK, bgK] of FILLS) {
      const fg = hex(t[fgK]);
      const bg = hex(t[bgK]);
      assert.ok(fg && bg, `${name} --${fgK}/--${bgK} 必須是 hex`);
      const r = ratio(fg, bg);
      if (r < 4.5) bad.push(`--${fgK} on --${bgK} = ${r.toFixed(2)}`);
    }
    assert.deepEqual(bad, [], `${name} 填色低對比：\n${bad.join("\n")}`);
  });
  test(`${name}：段位／等級色塊上的深字 ≥ 4.5:1`, () => {
    const dark = hex(t["on-gold"]);
    for (const k of ["tier-N", "tier-R", "tier-SR", "tier-SSR", "gold-fill"]) {
      const r = ratio(dark, hex(t[k]));
      assert.ok(r >= 4.5, `${name} --on-gold on --${k} = ${r.toFixed(2)}`);
    }
  });
}

test("主按鈕（固定朱紅漸層）上的字 ≥ 4.5:1", () => {
  const m = css.match(/\.btn-primary\s*\{([\s\S]*?)\}/)[1];
  const stops = [...m.matchAll(/#[0-9a-f]{6}/gi)].map((x) => x[0]);
  const color = m.match(/(?:^|\s)color:\s*(#[0-9a-f]{6})/i)[1];
  for (const s of stops) {
    if (s.toLowerCase() === color.toLowerCase()) continue;
    const r = ratio(hex(color), hex(s));
    if (m.includes(`border-color: ${s}`)) continue;
    assert.ok(r >= 4.5, `btn-primary ${color} on ${s} = ${r.toFixed(2)}`);
  }
});

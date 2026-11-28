// 「我的」頁要寫本站自己的頂階名（2026-11-28 rank-text-20261128：書靈寫成字靈的「文聖」、句靈寫成理靈的「開物」與靈山的「大成」、
// 理靈寫成靈山的「大成」；這些站都是由別站分出，說明文字沒跟著改）。頂階名一律取自 src/engine/score.ts 的第十二階。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const TOPS = ["文聖", "通人", "詞聖", "文宗", "大成", "開物", "文衡"]; // 七個收服站的頂階

test("「我的」頁的頂階說明寫本站頂階，不寫別站的", () => {
  const names = [...read("src/engine/score.ts").matchAll(/name: "([^"]+)"/g)].map((m) => m[1]);
  const top = names[11];
  assert.ok(TOPS.includes(top), `第十二階 ${top}`);
  const me = read("src/screens/Me.tsx");
  assert.match(me, new RegExp(`${top}另須題庫每一題都答對過`));
  assert.match(me, new RegExp(`題庫裡每一題都答對過才有${top}。`));
  for (const other of TOPS.filter((t) => t !== top)) {
    assert.doesNotMatch(me, new RegExp(`${other}另須題庫|才有${other}。`), `仍寫別站頂階 ${other}`);
  }
});

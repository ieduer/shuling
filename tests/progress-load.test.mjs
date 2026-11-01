// 存檔讀取防呆：某個表被寫壞成 null／字串／陣列時，記憶體裡改用空表、其餘欄位（詞力、局數、暱稱）原樣保留，且不主動改寫存檔。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";

const saved = { v: 1, xp: 31761, games: 160, best: 448, nick: "測試", daily: null, q: "broken", cards: [1, 2], stages: 7, achievements: undefined, misses: null, dayRuns: 5 };
let writes = 0;
globalThis.localStorage = { getItem: (k) => (k === "shuling-v1" ? JSON.stringify(saved) : null), setItem: () => { writes++; }, removeItem: () => {} };
globalThis.window = globalThis.window || {};
// progress.ts 用無副檔名的相對匯入，Node 直接載不了：用 esbuild 打包（react 留外部）再匯入
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ziling-progress-")); const out = path.join(dir, "progress.mjs");
await build({ entryPoints: [new URL("../src/engine/progress.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "neutral", target: "es2022", define: { "process.env.NODE_ENV": '"test"' }, outfile: out, logLevel: "silent" }); // react 一併打進去，暫存目錄裡沒有 node_modules
const { getProgress } = await import(out); fs.rmSync(dir, { recursive: true, force: true });

test("壞掉的表改用空表，數值與暱稱保留，讀取不寫回存檔", () => {
  const p = getProgress();
  assert.equal(p.xp, 31761); assert.equal(p.games, 160); assert.equal(p.best, 448); assert.equal(p.nick, "測試");
  for (const k of ["daily", "q", "cards", "stages", "achievements", "dayRuns"]) { assert.equal(typeof p[k], "object", k); assert(!Array.isArray(p[k]) && p[k] !== null, k); assert.deepEqual(p[k], {}, k); }
  assert.deepEqual(p.misses, []);
  assert.equal(writes, 0, "load() must not persist");
  assert.doesNotThrow(() => Object.values(p.cards).filter((c) => c.masteredAt));
});

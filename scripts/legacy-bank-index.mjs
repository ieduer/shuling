// 舊版題庫答案索引（2026-11-04 換版事故）：題庫換版後，還開著舊頁面的學生仍可能送出舊版題目的作答。
// 從 git 歷史裡每一版已提交的 worker/bank-index.json 取出「現行題庫沒有的題」與「同題號但答案雜湊不同的題」，
// 寫成 worker/bank-index-legacy.json，Worker 核分時用它兜底；題海分母仍只算現行題庫。
// 用法：每次題庫換版、build:data 之後跑 `npm run build:legacy-index`，與新題庫同一個提交。
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "worker/bank-index.json";
const OUT = "worker/bank-index-legacy.json";
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const current = JSON.parse(readFileSync(FILE, "utf8"));
const commits = git("log", "--format=%H", "--", FILE).split("\n").filter(Boolean);
const versions = [];
const q = {}; // 現行沒有的題：{ c, t, r, a: [雜湊…] }
const alt = {}; // 現行有、但舊版答案雜湊不同：[雜湊…]
for (const sha of commits) {
  const old = JSON.parse(git("show", `${sha}:${FILE}`));
  if (old.version === current.version || versions.includes(old.version)) continue;
  versions.push(old.version);
  for (const [id, e] of Object.entries(old.q)) {
    const cur = current.q[id];
    if (cur) {
      if (e.a !== cur.a) (alt[id] ||= []).includes(e.a) || alt[id].push(e.a);
    } else if (q[id]) {
      if (!q[id].a.includes(e.a)) q[id].a.push(e.a);
    } else {
      q[id] = { c: e.c, t: e.t, r: e.r, a: [e.a] };
    }
  }
}
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
writeFileSync(OUT, JSON.stringify({ current: current.version, versions, q: sortObj(q), alt: sortObj(alt) }) + "\n");
console.log(`legacy index: ${versions.length} old versions (${versions.join(", ")}), ${Object.keys(q).length} retired qids, ${Object.keys(alt).length} qids with old answer hashes`);

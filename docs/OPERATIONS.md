# 書靈 · operations

Owner: suen. Lifecycle: live since 2026-11-01. Data class: student_owned (nick, run scores and answers keyed by an opaque player id; for signed-in players one User Center progress snapshot `shuling-total`, record-only).

## Quick start

- Canonical path `sites/interactive/shuling`; branch `main`, remote `ieduer/shuling` (public).
- Design authority: `_meta/reports/operations/shuling-design-20261031/DESIGN.md` (P0–P4), citation analysis `NOBEL_CITATIONS_ANALYSIS.md`.
- Engine provenance: forked from `sites/interactive/wy-word-battle` main `4b6013c` on 2026-10-31. Rank, sync, outbox and run-idempotency semantics are 字靈's (see its `docs/RANK_DESIGN.md`, `docs/SYNC_DESIGN.md`) except where this file says otherwise.

## Content pipeline

1. Sources are registered in `scripts/lib/sources.mjs` (`nobel-api`, `wikidata`, `curated-nobel`, `curated-canon`, `wikidata-canon`, `cp-anthologies`, `cp-corpus`, `tw-exams`, `recite-ms`, `recite-gk`), each pointing at snapshots in `data/raw/` or `data/curated/`. The builder hashes every snapshot into `data/BUILD-REPORT.json`; the bank version is a hash of those snapshots and the builder code.
2. Loaders turn snapshots into cards with facts:
   - `scripts/content/poetry.mjs` — 雲山詩國 from `data/curated/canon/shi.mjs`: every textbook recitation poem (琅琅 初中 124 篇 at recite.rdfz.net `3a2e14a`, 高考 篇目) plus the curated canonical poems outside the textbooks, located in 《唐詩三百首》《宋詞三百首》 or the 風雅千載 extract. Each famous line must match its source verbatim (punctuation ignored, 繁簡 normalized); the displayed line is the source's own wording, and where the popular version differs the explanation says 「通行本作…」. Poets' 字號／稱號 and 並稱／流派 groups come from the same table.
   - `scripts/content/canon.mjs` — the other curated books (`wen`, `shuo`, `xin`, `aegean`, `rome`, `east`, `europe`, `c19`, `modern`, `fusang`, `schools`): works (author, characters, famous lines, defining facts), writers (epithets, nationality), groups and movements (curated non-member pools), literary-theory terms and literary forms. Textbook prose lines and theory quotes are verified against the 琅琅 texts; world-literature authors, dates and characters are checked against `data/raw/wikidata/canon.json`.
   - `scripts/content/nobel.mjs` — official prizes × curated names and citation phrases × Wikidata languages/works/sitelinks; a citation phrase that names the laureate is skipped as a leak.
   - 真卷殿: `data/raw/exams/tw-literature.json` (指考, official answers) and `data/raw/exams/bj-literature.json` (北京卷) from `node scripts/fetch/bj_exams.mjs [GK_REPO] [COMMIT]`, which reads the gk.bdfz.net accepted source (`a209908`): `data/all.json`, `data/answer-authority.json`, `data/answer-release-scope.json`. It keeps only reviewed single-choice items inside the release scope whose authority hash still matches the question text, never a 「教學修訂版」 text, strips gk editorial notes from passages, tidies option layout only (drops the paper's answer box 「答：[ ]」 after the last option, which would mark that option; joins name-list columns with 「、」 so 「李 白」 is not read as two names), keeps as further reading only original texts and dictionary entries (gk's provenance and answer-source entries are verification records, not titles for readers), and takes all 詩詞鑑賞 items plus a reviewed list of 文學常識 and 紅樓夢 items. 北京卷 answers are a qualified study reference (no published official key); the source label and every explanation say so. Each 北京卷 item also carries the analysis gk shows students (`modelAnswers[currentVersion]` of the answer table, bound to the current question hashes, conclusion letter equal to the reviewed answer), shown in the reveal as 「解析 · 高考站 AI 參考解析（GPT-6 Astra）」, opened after a wrong answer. It is copied verbatim (簡體) except for the reviewed `TRIM` rules in `bj_exams.mjs` that drop gk process notes (題面更正、出版鏈、裁定經過); trimmed items say 「節錄」, and a residue check fails the run if any process wording is left. 真題 (指考 and 北京卷) carry `keys` (the paper's option letters, aligned with `opts`): the battle shows them in the paper's order with A–D labels instead of shuffling under 甲乙丙丁, so 「參考答案（C）」, 「官方答案（D）」 and the analysis' 「A项…」 match the screen. Answers are still checked by option text, so the Worker is unaffected.
   - Snapshot refreshers: `node scripts/fetch/cp_extract.mjs [CP_CORPUS_DIR]` (extra poems + title census + 樂府 titles from `sites/chinese/cp/corpus`, about 60 s) and `node scripts/fetch/canon_wikidata.mjs CACHE_DIR` (Wikidata resolution of world writers and works, cached, 1.1 s between calls).
3. `node scripts/build-bank.mjs` generates questions per predicate, assigns stages (Nobel: by 授獎辭 period, 10 cards per stage; 詩國: mixed-era stages by hash so stage names never reveal an era) and writes `public/bank/meta.<v>.json`, per-book chunks, `worker/bank-index.json`, `worker/lessons.json`, `src/data/bank-version.json`.
4. Strict failures: unregistered source, citation phrase not verbatim in the official motivation, curated work QID not in the laureate's Wikidata P800, famous line or quote not in its text, textbook poem without curated lines, duplicate fact or identical question text, fewer than three distractors, stage under three questions. Warnings (reported, not blocking): `NOBEL-WIKIDATA-MISMATCH`, cards left with fewer than two questions after leak guards (dropped with their questions), writers folded for lack of a second fact, stems that would leak their own answer (skipped).
4a. Title rule: a poem's title is asked for its author only if it identifies one poem — not a 詞牌／曲牌 (bare, with a first line, a series number or an alias tune), not a 樂府舊題 (the corpus files it under a 樂府 category), not used by another poet of the same or an earlier era, and unique in the bank. 詞牌·真題目 (〈念奴嬌 · 赤壁懷古〉) counts as identifying. Other poems are asked through their lines (出處 when the title identifies the poem, otherwise 作者).
5. Refreshing snapshots: Nobel API `https://api.nobelprize.org/2.1/nobelPrizes?nobelPrizeCategory=lit&limit=200&sort=asc` and `.../laureates?nobelPrizeCategory=lit&limit=200`; Wikidata `wbgetentities` in batches of 50 with a 4 s pause and Retry-After backoff (it returns 429 on bursts). Re-run the build and tests after any refresh.

## Question rules specific to 書靈

- The battle foe is masked (`？`, no subtitle) until the answer is revealed, because most questions have the card itself as the answer. Stage tooltips stay hidden until a question is answered.
- Question meta shows only book and type; stage titles never contain an era or a year.
- Time limits: 20 s per question, 90 s for 真題 (`EXAM_LIMIT_MS`, 2026-11-02) because a 真題 asks the player to read a whole poem or passage and compare four long options; `limitOf(type)` in `src/engine/score.ts` drives the timer, the speed score and the Worker clamp.
- Language labels are normalized (英國英語→英語, 官話→中文, 現代希臘語→希臘語, 新挪威語→挪威語); the raw Wikidata label appears in the explanation.
- Long names: `glyphPx` caps names of five or more characters at the width of a four-character word.

## Build, test, preview

```sh
node scripts/build-bank.mjs
npm test
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.worker.json
npx vite --host 127.0.0.1 --port 5196 --strictPort .
```

Vite mode has no Worker, so `/api/*` is offline and results save locally only. `npx wrangler dev --local` runs the Worker with a local D1 (placeholder id) when API behaviour needs checking; `tests/sync.test.mjs` and `tests/run-dedupe.test.mjs` already drive the Worker against an in-memory D1.

## Release, data, rollback

First release 2026-11-01: source `cf3273a`, Worker `shuling` deployment `46176ed0` / version `3d2c2e6b`, D1 `shuling-db` `efec6261` (migrations 0001–0004), custom domain `shuling.bdfz.net`, workers.dev disabled (previews enabled). Evidence and controller: `_meta/reports/operations/shuling-launch-20261101/`.

- UC release 2026-11-01: source `8206df5`, version `57a2e54a`, deployment `bdad29a8` (record-only User Center; Worker code identical apart from esbuild path comments). Evidence `hub/shuling-uc/` in the same folder.
- Core-canon release 2026-11-02: source `c1ef85d`, version `18a20083`, deployment `dab5b234` (bank `8bf4e811ff05`). Evidence `_meta/reports/operations/shuling-canon-20261101/`.
- 北京卷 release 2026-11-02: source `caa83b3`, version `e08e6d23`, deployment `c7d0a6f9` (bank `4ec05cb17a06`; Worker change: answer-time clamp uses `limitOf`, 90 s for 真題). Evidence `_meta/reports/operations/shuling-bj-20261102/r2/`. The first candidate (`bc86ae80`, source `478077c`) was attached at 0% and withdrawn at preview (`../evidence/superseded-NOTE.json`); the `r2` driver's baseline binds to that staged state and its stage0 deployment detached it. Never leave a withdrawn candidate attached without a note.
- Later releases: build from clean pushed `main`, upload a version tagged with the source commit, verify through a version override, then promote with an exact receipt via `scripts/release-worker-transaction.mjs`. The latest standard driver is `_meta/reports/operations/shuling-bj-20261102/tools/shuling-release.mjs` (copy it and change `CHANGE`, the evidence folder, the bank contract and the reviewed allowlists). Wrangler is pinned at 4.100.0, whose `versions upload` has no `--strict`. D1 migrations are additive and need a `wrangler d1 export` first.
- Rollback: previous immutable version through a registered rollback (currently `18a20083` / deployment `dab5b234`, source `c1ef85d`: the core-canon build, 20-second limit for every type). Runs recorded on the newer bank stay in D1; their question ids simply stop scoring after a rollback.
- New hostnames: the bdfz.net SOA negative TTL is 1800 s. If anything resolved the name before it existed, resolvers (including this Mac's proxy and 1.1.1.1) keep answering NXDOMAIN for up to 30 minutes; check production through the zone edge address (`curl --resolve host:443:<edge ip>`) and the DNS record via the API instead of waiting.
- Status: `20261101-shuling-launch`, `20261101-shuling-register`, `20261101-shuling-uc` (site keys `shuling`, `my`), `20261102-shuling-core-canon`, `20261102-shuling-beijing-exam`. Every accepted release needs its own Status record (`runbooks/status_public_updates.md`).

## Local runtime disk profile

1. Authority: this checkout is the only copy; read-only agents may read it.
2. Size classes: tracked sources and snapshots < 10 MB (`data/` ≈ 1 MB, `public/` ≈ 5 MB including borrowed art); `node_modules` ≈ 260 MB; `dist/` ≈ 10–30 MB when built; `.wrangler/` only if `wrangler dev` runs.
3. Largest normal operation: `npm install` + `vite build`; conservative incremental peak 1 GiB.
4. Preflight: `scripts/check_workspace_disk_budget.sh --operation 'shuling-<step>' --peak-gib 1`.
5. Generated paths: `node_modules/` (derivative, from `package-lock.json`), `dist/` (derivative, gitignored), `.wrangler/` (derivative), bank outputs listed above (generated source, kept in the tree like 字靈).
6. Cleanup: the task that creates `node_modules/`, `dist/` or `.wrangler/` removes them at closeout unless its manifest retains them with owner, reason and review date.
7. ENOSPC: delete `dist/` and the bank outputs, re-run the build from snapshots; reinstall `node_modules/` with `npm ci --prefer-offline`.
8. Runtime root convention `/private/tmp/cf-task-<TASK_ID>`; manifests under `reports/private/runtime-artifact-manifests/`.
9. Run `scripts/check_task_runtime_manifest.mjs --phase running` after each install/build and `--phase closeout` before the closeout row.
10. Non-hot resources: none yet; `data/raw/` snapshots are source and stay in the tree.

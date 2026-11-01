# 書靈 · operations

Owner: suen. Lifecycle: live since 2026-11-01. Data class: student_owned (nick, run scores and answers keyed by an opaque player id; for signed-in players one User Center progress snapshot `shuling-total`, record-only).

## Quick start

- Canonical path `sites/interactive/shuling`; branch `main`, remote `ieduer/shuling` (public).
- Design authority: `_meta/reports/operations/shuling-design-20261031/DESIGN.md` (P0–P4), citation analysis `NOBEL_CITATIONS_ANALYSIS.md`.
- Engine provenance: forked from `sites/interactive/wy-word-battle` main `4b6013c` on 2026-10-31. Rank, sync, outbox and run-idempotency semantics are 字靈's (see its `docs/RANK_DESIGN.md`, `docs/SYNC_DESIGN.md`) except where this file says otherwise.

## Content pipeline

1. Sources are registered in `scripts/lib/sources.mjs` (`nobel-api`, `wikidata`, `curated-nobel`, `recite-ms`, `recite-gk`), each pointing at snapshots in `data/raw/` or `data/curated/`. The builder hashes every snapshot into `data/BUILD-REPORT.json`; the bank version is a hash of those snapshots and the builder code.
2. Loaders turn snapshots into cards with facts: `scripts/content/nobel.mjs` (official prizes × curated names and citation phrases × Wikidata languages/works/sitelinks), `scripts/content/poetry.mjs` (琅琅 poems → work and poet cards; only lines unique across the corpus; era fixes must quote the source's own author note).
3. `node scripts/build-bank.mjs` generates questions per predicate, assigns stages (Nobel: by 授獎辭 period, 10 cards per stage; 詩國: mixed-era stages by hash so stage names never reveal an era) and writes `public/bank/meta.<v>.json`, per-book chunks, `worker/bank-index.json`, `worker/lessons.json`, `src/data/bank-version.json`.
4. Strict failures: unregistered source, citation phrase not verbatim in the official motivation, curated work QID not in the laureate's Wikidata P800, line not in its text, duplicate fact or identical question text, fewer than three distractors, stage under three questions, card with fewer than two answerable facts. `NOBEL-WIKIDATA-MISMATCH` is a warning (the mismatched item is ignored).
5. Refreshing snapshots: Nobel API `https://api.nobelprize.org/2.1/nobelPrizes?nobelPrizeCategory=lit&limit=200&sort=asc` and `.../laureates?nobelPrizeCategory=lit&limit=200`; Wikidata `wbgetentities` in batches of 50 with a 4 s pause and Retry-After backoff (it returns 429 on bursts). Re-run the build and tests after any refresh.

## Question rules specific to 書靈

- The battle foe is masked (`？`, no subtitle) until the answer is revealed, because most questions have the card itself as the answer. Stage tooltips stay hidden until a question is answered.
- Question meta shows only book and type; stage titles never contain an era or a year.
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
- Later releases: build from clean pushed `main`, upload a version tagged with the source commit, verify through a version override, then promote with an exact receipt via `scripts/release-worker-transaction.mjs`. `hub/tools/shuling-release.mjs` does all of this (copy it and change `CHANGE`, the evidence folder and the reviewed allowlists). Wrangler is pinned at 4.100.0, whose `versions upload` has no `--strict`. D1 migrations are additive and need a `wrangler d1 export` first.
- Rollback: previous immutable version through a registered rollback (currently `3d2c2e6b`, the build without User Center).
- New hostnames: the bdfz.net SOA negative TTL is 1800 s. If anything resolved the name before it existed, resolvers (including this Mac's proxy and 1.1.1.1) keep answering NXDOMAIN for up to 30 minutes; check production through the zone edge address (`curl --resolve host:443:<edge ip>`) and the DNS record via the API instead of waiting.
- Status: `20261101-shuling-launch`, `20261101-shuling-register`, `20261101-shuling-uc` (site keys `shuling`, `my`). Every accepted release needs its own Status record (`runbooks/status_public_updates.md`).

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

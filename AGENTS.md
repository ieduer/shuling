# AGENTS.md for sites/interactive/shuling

## Project scope

書靈：中外文學與文化知識的收服遊戲（字靈收服的姊妹站）。玩家收服的是作家、作品，日後還有意象、術語、制度；最高段位「通人」。
設計方案（站長 2026-10-31 批准「按方案推進落實」）：`_meta/reports/operations/shuling-design-20261031/DESIGN.md`；
諾貝爾授獎辭分析：同目錄 `NOBEL_CITATIONS_ANALYSIS.md`。

This project inherits the BDFZ operations workspace `AGENTS.md` (paths in this file are relative to that workspace). Read, in order: the workspace instructions, this file, `docs/OPERATIONS.md`, `PROJECT_STATE.md`, then the target source and tests.

## Current status (2026-10-31)

- Local development only (initial commit on local `main`, 2026-10-31). No GitHub remote, no Cloudflare resources, no domain, not in release-authority, User Center, nav, portals, Pulse or Status.
- Engine forked from 字靈收服 `ieduer/wy-word-battle` main `4b6013c` (React + Vite + TypeScript, Cloudflare Worker + Workers Assets + D1). It is a clone-family copy, not a shared package; never edit 字靈 from here.
- Content P1: 雲山詩國 (課本必背＋《唐詩三百首》《宋詞三百首》), 愛琴海, 七丘, 扶桑, 諾貝爾星河 (all 123 laureates), 思潮館 (Wikidata movements), 真卷殿 (verified single-answer 指考 literature items).

## Operating constraints

- Source of truth: this directory, local git branch `main` (no remote yet; commit when the owner asks, never push before a repository is approved). Generated outputs (`public/bank/`, `worker/bank-index.json`, `worker/lessons.json`, `src/data/bank-version.json`) come only from `node scripts/build-bank.mjs`; never hand-edit them.
- Every fact cites a source registered in `scripts/lib/sources.mjs` with a snapshot under `data/raw/` or `data/curated/`; the strict build fails otherwise. Never invent sources, dates, titles or translations; mark unknowns `-` and leave them out.
- Scripts: UI text 繁體; quoted titles, author names and lines keep the source script (mainland textbook = 簡體 原文軌). Do not run OpenCC phrase conversion on content (★繁簡規則).
- User Center: `UC_REGISTERED = false` in `src/lib/identity.ts`, and `index.html` does not load `my.bdfz.net/site-auth.js`. Do not turn either on before the public-project registration transaction (shared hub change). `tests/uc-gate.test.mjs` enforces this.
- `wrangler.toml` has no route, `workers_dev = false` and a placeholder D1 id so any deploy fails closed. Production writes need a registered target in `platform/release-authority.json` and explicit owner authorization.
- UI follows the 字靈 long-term directives (real painted icons, no SVG/emoji icons, four-palette cycle, contrast gate, 375 px and desktop route checks). Art is 書靈's own (`public/assets/art/v1/`, prompts and seeds in `art-pack/jobs.json`, `art-pack/cfgen.py` + `art-pack/post.py`): same rendering style as 字靈, different palette (celadon, moonstone, indigo, silver) and motifs. Never copy 字靈 assets; reject any image with model-invented characters.
- Never AI-generate a real person's face; person cards use only verified public-domain or licensed portraits, or none.

## Commands

```sh
node scripts/build-bank.mjs          # strict; --loose only to print the report
npm test                             # node --experimental-strip-types --test tests/*.test.mjs
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.worker.json
npx vite --host 127.0.0.1 --port 5196   # UI preview; /api/* is offline in Vite mode
```

## Documentation and handoff gate

Before mutation append a scoped action-log `start` (`scripts/record_agent_action.mjs`). Update `docs/OPERATIONS.md` when an operational fact changes and `PROJECT_STATE.md` when state changes. Closeout lists files, tests, artifacts created/removed, and unresolved items. Chat is not a handoff authority.

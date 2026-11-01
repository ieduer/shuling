# Project State

Last updated: 2026-11-01 (task `shuling-launch-20261101`)

Current version: live at https://shuling.bdfz.net — source `cf3273a` (ieduer/shuling main, public), Worker `shuling` deployment `46176ed0` / version `3d2c2e6b`, D1 `shuling-db` `efec6261`, bank `904cada1558e`. First release 2026-11-01 (registry project `shuling-bdfz-net`, evidence `_meta/reports/operations/shuling-launch-20261101/`).

Current objective: 設計方案 P1 — 雲山詩國＋萬國星海（愛琴海、七丘、扶桑、諾貝爾星河、思潮館）＋相關真卷，連同今日、旅程、探險、圖鑑、排行、同步，然後公開上線。

Completed work:
- Project scaffold forked from 字靈收服 `4b6013c` (engine, UI, Worker, migrations renumbered 0001–0004, tests).
- Strict content pipeline `scripts/build-bank.mjs`: source registry, fact → question templates, deterministic hard distractors, tiers by evidence (Wikidata sitelinks for laureates, textbook presence for poems), stages, 字靈-compatible outputs.
- 2026-11-01: content 1,057 cards / 3,536 questions / 110 stages in seven books — 詩國 824 (textbook + 唐詩/宋詞三百首, chinese-poetry b8594f8), 愛琴海 26, 七丘 11, 扶桑 49 (Wikidata-resolved, two-strait names), 諾貝爾 123, 思潮館 9 (Wikidata P135; distractors only from people who cannot belong), 真卷殿 15 papers / 71 指考 items (answer-verified single choice). Own art set (66 images, Workers AI lucid-origin). Earlier first batch: 223 cards / 739 questions / 24 stages. 諾貝爾星河 123 laureates (year, verbatim citation phrase, Wikidata notable work where curated, writing language); 雲山詩國 100 cards (62 poems + poets from 琅琅 初中＋高考 背誦篇目).
- Leak fixes specific to knowledge questions: foe name and subtitle masked until reveal; stage titles carry no era or year; question meta shows book and type only; year distractors from the same 授獎辭 period.
- User Center fully gated off (`UC_REGISTERED = false`, no site-auth.js).
- Rank ladder 童蒙…祭酒、通人 with 學力 thresholds from the design; region bonus 2,500.
- Tests 132/132; both TypeScript projects clean; local Vite preview checked on desktop and 375 px (home, journey, battle, reveal, result).

Pending work:
- Content to reach P1 scope: 愛琴海、七丘、扶桑、思潮館 cards; full 詩國 coverage beyond the 62 recited poems (cp 選本, 課本全部古詩詞, 意象苑, 格律台); real exam questions from gk/tw (answer-verified only); Nobel works for the ~45 laureates still without one; 臺灣譯名 display preference.
- Art: 書靈's own maps, card art and region guardians (Workers AI lucid-origin pipeline); currently borrowed from 字靈.
- New game modes from the design (合璧、宗師戰、文脈長卷、時間長河、溫書、論衡殿) — P2–P4.
- 通人 final gate (十一域全通＋論衡殿) replaces the P1 stand-in (all questions answered correctly) in P4.
- Launch prerequisites: owner decisions on domain and GitHub repo; release-authority registration; D1 creation; five-face public registration (UC SITE_REGISTRY, nav, i.rdfzer.com, rdfz.net, Pulse); Status record.

Known problems:
- Official Nobel API maps J. M. G. Le Clézio to a Wikidata item that is a letter, not the author; the build ignores it (no language/work facts for him) and reports `NOBEL-WIKIDATA-MISMATCH`.
- 字靈's own `package-lock.json` is out of sync with its package.json (`@emnapi/wasi-threads` 1.2.2 vs 1.2.3), so `npm ci` fails there; 書靈 regenerated its own lockfile with `npm install`.

Launch registration (task shuling-launch-20261101): done for Pulse (72d60fb / caf2f596), nav.bdfz.net v28 (a6989b6 / 1798cc26), i.rdfzer.com (75460e5 / 6302e2d1), rdfz.net (146ee19 / a3ac9c09), Status 20261101-shuling-launch and 20261101-shuling-register. Candidates live on branch claude/shuling-register-20261101 of each hub repo (not yet merged into their main). Pending: User Center SITE_REGISTRY row, then a 書靈 release with UC_REGISTERED=true and site-auth.js plus a real signed-in write/readback.

Next recommended task: author 愛琴海 and 扶桑 cards (Wikidata-backed works and authors, two-strait names), then import answer-verified gk/tw literature questions.

Deployment status: accepted first release 2026-11-01 (custom domain shuling.bdfz.net; workers.dev disabled, previews enabled). Later releases: source-tagged preview version + exact receipt via scripts/release-worker-transaction.mjs.

Rollback anchor: no earlier version; remove custom domain shuling.bdfz.net (id 5693d82b…) to take the site offline. D1 rows stay.

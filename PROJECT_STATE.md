# Project State

Last updated: 2026-11-02 (task `shuling-canon-20261101`)

Current version: live at https://shuling.bdfz.net — source `c1ef85d` (ieduer/shuling main, public), Worker `shuling` deployment `dab5b234` / version `18a20083` (core-canon bank `8bf4e811ff05`, User Center record-only unchanged; rollback version `57a2e54a` / deployment `bdad29a8`, source `8206df5`), D1 `shuling-db` `efec6261`. Accepted 2026-11-02T01:47Z, effective 00:51Z (evidence `_meta/reports/operations/shuling-canon-20261101/`, Status `20261102-shuling-core-canon`). First release 2026-11-01 (registry project `shuling-bdfz-net`, evidence `_meta/reports/operations/shuling-launch-20261101/`).

Current objective: core-canon edition (owner 2026-11-01) — the bank is the most important content and key questions of human literature; title→author only for titles that identify one poem.

Completed work:
- Project scaffold forked from 字靈收服 `4b6013c` (engine, UI, Worker, migrations renumbered 0001–0004, tests).
- Strict content pipeline `scripts/build-bank.mjs`: source registry, fact → question templates, deterministic hard distractors, tiers by evidence (Wikidata sitelinks for laureates, textbook presence for poems), stages, 字靈-compatible outputs.
- 2026-11-01: content 1,057 cards / 3,536 questions / 110 stages in seven books — 詩國 824 (textbook + 唐詩/宋詞三百首, chinese-poetry b8594f8), 愛琴海 26, 七丘 11, 扶桑 49 (Wikidata-resolved, two-strait names), 諾貝爾 123, 思潮館 9 (Wikidata P135; distractors only from people who cannot belong), 真卷殿 15 papers / 71 指考 items (answer-verified single choice). Own art set (66 images, Workers AI lucid-origin). Earlier first batch: 223 cards / 739 questions / 24 stages. 諾貝爾星河 123 laureates (year, verbatim citation phrase, Wikidata notable work where curated, writing language); 雲山詩國 100 cards (62 poems + poets from 琅琅 初中＋高考 背誦篇目).
- 2026-11-02 core-canon edition (task `shuling-canon-20261101`): 1,283 cards / 3,630 questions / 135 stages in fourteen books — 詩國 350 (all 126 textbook poems + 121 canonical poems, 名句 verbatim; 124 title→author questions left, none on a 詞牌/樂府舊題/shared title), 文淵 104, 說部梨園 47, 新潮碼頭 106, 愛琴海 30, 七丘 22, 新月與恆河 28, 聖殿長廊 63, 浪漫與寫實 148, 現代迷城 114, 扶桑 67, 諾貝爾 123, 思潮館 66, 真卷殿 15. The 唐詩／宋詞三百首 long tail (吳文英 25 首 etc.) is no longer asked. Seven new region maps (Workers AI, same style). Wikidata resolved 160 writers and 295 works; 6 entries stay editorial-only. Released as `c1ef85d` / `18a20083`: tests 145/145, candidate served exactly under a version override (98 files) and in production, browser checks on the override proxy and on shuling.bdfz.net (no run submitted).
- 2026-11-02 北京卷 in 真卷殿 (task `shuling-bj-20261102`): 40 items from the gk.bdfz.net answer table (accepted `a209908`) — 33 詩詞鑑賞 (2004–2026), 6 文學常識 (2007–2012), 1 紅樓夢 (2014); 18 cards beside the 指考 ones; bank 1,301 cards / 3,670 questions / 137 stages. Answers are labelled as a qualified study reference. 真題 now have a 90-second limit (other types stay at 20 s); client timer, speed score and the Worker's clamp use the same `limitOf`.
- Leak fixes specific to knowledge questions: foe name and subtitle masked until reveal; stage titles carry no era or year; question meta shows book and type only; year distractors from the same 授獎辭 period.
- User Center record-only since 2026-11-01 (`8206df5`): SITE_REGISTRY row `shuling` (UC `db4a95a`, version `5db645a3`), page loads site-auth.js, one progress snapshot `shuling-total` per run; signed-in write and readback verified. No events, mastery or A+.
- Rank ladder 童蒙…祭酒、通人 with 學力 thresholds from the design; region bonus 2,500.
- Tests 145/145 (2026-11-02); both TypeScript projects clean; local Vite preview checked on desktop and 375 px (home, journey, battle, reveal, result).

Pending work:
- Further canon: 意象苑 (common images and their meanings), 漢字文化圈 (Korea, Vietnam); Nobel works for the laureates still without one; 臺灣譯名 display preference. 北京卷 items needing a passage (散文、小說) or language-use drills stay out of 書靈.
- New game modes from the design (合璧、宗師戰、文脈長卷、時間長河、溫書、論衡殿) — P2–P4.
- 通人 final gate (十一域全通＋論衡殿) replaces the P1 stand-in (all questions answered correctly) in P4.

Known problems:
- Official Nobel API maps J. M. G. Le Clézio to a Wikidata item that is a letter, not the author; the build ignores it (no language/work facts for him) and reports `NOBEL-WIKIDATA-MISMATCH`.
- 字靈's own `package-lock.json` is out of sync with its package.json (`@emnapi/wasi-threads` 1.2.2 vs 1.2.3), so `npm ci` fails there; 書靈 regenerated its own lockfile with `npm install`.

Launch registration (task shuling-launch-20261101): done for Pulse (72d60fb / caf2f596), nav.bdfz.net v28 (a6989b6 / 1798cc26), i.rdfzer.com (75460e5 / 6302e2d1), rdfz.net (146ee19 / a3ac9c09), Status 20261101-shuling-launch and 20261101-shuling-register. User Center (db4a95a / 5db645a3 / 8e483340) and the UC-enabled 書靈 release (8206df5 / 57a2e54a / bdad29a8), Status 20261101-shuling-uc. Candidates live on branch claude/shuling-register-20261101 of each hub repo (not yet merged into their main).

Next recommended task: 意象苑.

Deployment status: accepted 2026-11-01 07:06Z, User Center record-only release (custom domain shuling.bdfz.net; workers.dev disabled, previews enabled). Releases: source-tagged preview version + exact receipt via scripts/release-worker-transaction.mjs (driver `_meta/reports/operations/shuling-launch-20261101/hub/tools/shuling-release.mjs`).

Rollback anchor: Worker version `3d2c2e6b` (source `cf3273a`, deployment `46176ed0`, the build without User Center); D1 rows and User Center progress rows written meanwhile stay.

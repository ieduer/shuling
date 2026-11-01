-- 書靈：自字靈收服 migrations/0003_rank.sql（4b6013c1e628ced64ad4668dab40834eca118c1b）原樣沿用，重新編號。
-- 段位改制（2026-10-28 v2.4）：players 多三欄，伺服器每局算收服數、通關數與段位，排行榜據此顯示徽章。
-- 純增欄、預設 0；既有列由發布時的回填腳本（release-7/backfill-rank.mjs）用同一規則算一次。詞力不回溯。
ALTER TABLE players ADD COLUMN mastered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN cleared INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN rank_idx INTEGER NOT NULL DEFAULT 0;

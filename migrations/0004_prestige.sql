-- 書靈：自字靈收服 migrations/0005_prestige.sql（4b6013c1e628ced64ad4668dab40834eca118c1b）原樣沿用，重新編號。
-- 成就併入詞力（2026-10-31 v2.10 站長定案）：players 多一欄 prestige＝對局入帳詞力（xp）＋收服×30＋三星通關×120＋全通一域×1,500＋題海每題×4，
-- 段位門檻與總榜都看這個數（已連結帳號取伺服器戰報與雲端存檔之大者）。純增欄、預設 0；既有列由發布時的回填腳本
-- （reports/operations/wygame-v210-20261031/tools/backfill-prestige.mts）用同一規則算一次；Worker 每局、每次存檔、每次連結都重算。
ALTER TABLE players ADD COLUMN prestige INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_players_prestige ON players(prestige DESC);

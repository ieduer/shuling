-- 書靈：自字靈收服 migrations/0004_sync.sql（4b6013c1e628ced64ad4668dab40834eca118c1b）原樣沿用，重新編號。
-- 跨裝置同步（2026-10-29 v2.5）：登入用戶中心後，存檔以 UC 帳號（slug）為鍵存在伺服器；同一位學生的各裝置共用同一個 pid（players.uc_slug）。
-- 純增表／純增欄，預設空值；既有列、其他表與資料一律不動，不刪任何資料（站長 2026-10-29：確保不要丟失此刻學生數據和進度）。
CREATE TABLE IF NOT EXISTS saves (
  slug TEXT PRIMARY KEY,
  pid TEXT NOT NULL,
  data TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  v INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
ALTER TABLE players ADD COLUMN merged_into TEXT;
ALTER TABLE players ADD COLUMN linked_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_players_uc_slug ON players(uc_slug);
-- 併帳審計：把某裝置的匿名戰績併入帳號的正本 pid 時，先把兩邊的 players／daily_best／weekly_sum 列原樣存成快照，再改指向。
CREATE TABLE IF NOT EXISTS player_merges (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  from_pid TEXT NOT NULL,
  into_pid TEXT NOT NULL,
  at INTEGER NOT NULL,
  snapshot TEXT NOT NULL
);

-- 書靈：自字靈收服 migrations/0002_arena.sql（4b6013c1e628ced64ad4668dab40834eca118c1b）原樣沿用，重新編號。
-- 文言詞陣重寫：玩家、對局、逐題作答、每日最佳、每週累計。舊表（runs/answers/mastery）保留不動。
CREATE TABLE IF NOT EXISTS players (
  pid TEXT PRIMARY KEY,
  nick TEXT NOT NULL DEFAULT '',
  uc_slug TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  games INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_xp ON players(xp DESC);

CREATE TABLE IF NOT EXISTS arena_runs (
  id TEXT PRIMARY KEY,
  pid TEXT NOT NULL,
  mode TEXT NOT NULL,
  scope TEXT NOT NULL,
  seed TEXT NOT NULL,
  day_key TEXT NOT NULL,
  week_key TEXT NOT NULL,
  score INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  max_combo INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  scored INTEGER NOT NULL,
  bank_v TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arena_runs_day ON arena_runs(day_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_runs_pid ON arena_runs(pid, created_at DESC);

CREATE TABLE IF NOT EXISTS arena_answers (
  run_id TEXT NOT NULL,
  q TEXT NOT NULL,
  card TEXT NOT NULL,
  correct INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  PRIMARY KEY (run_id, q)
);
CREATE INDEX IF NOT EXISTS idx_arena_answers_card ON arena_answers(card);

CREATE TABLE IF NOT EXISTS daily_best (
  pid TEXT NOT NULL,
  day_key TEXT NOT NULL,
  score INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (pid, day_key)
);
CREATE INDEX IF NOT EXISTS idx_daily_best_day ON daily_best(day_key, score DESC);

CREATE TABLE IF NOT EXISTS weekly_sum (
  pid TEXT NOT NULL,
  week_key TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  games INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pid, week_key)
);
CREATE INDEX IF NOT EXISTS idx_weekly_sum_week ON weekly_sum(week_key, score DESC);

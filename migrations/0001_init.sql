CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pin_hash TEXT,
  pin_version INTEGER NOT NULL DEFAULT 1,
  session_secret TEXT,
  updated_at INTEGER
);
INSERT OR IGNORE INTO settings (id, pin_version) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS season (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  first_monday TEXT NOT NULL,
  regular_weeks INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skip_week (
  monday_date TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'No Games'
);

CREATE TABLE IF NOT EXISTS division (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  teacher_name TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  division_id INTEGER NOT NULL REFERENCES division(id),
  nfl_team_id TEXT NOT NULL UNIQUE,
  created_order INTEGER NOT NULL,
  tiebreak_seed REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS week (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('regular','skip','semifinal','superbowl')),
  monday_date TEXT NOT NULL UNIQUE,
  start_at INTEGER NOT NULL,
  lock_at INTEGER NOT NULL,
  publish_at INTEGER NOT NULL,
  label TEXT NOT NULL,
  regular_no INTEGER,
  finalized INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS matchup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL REFERENCES week(id),
  team_a_id INTEGER NOT NULL REFERENCES team(id),
  team_b_id INTEGER NOT NULL REFERENCES team(id),
  bracket_slot TEXT CHECK (bracket_slot IN ('semi1','semi2','final')),
  seed_a INTEGER,
  seed_b INTEGER
);
CREATE INDEX IF NOT EXISTS idx_matchup_week ON matchup(week_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matchup_slot ON matchup(bracket_slot) WHERE bracket_slot IS NOT NULL;

CREATE TABLE IF NOT EXISTS award (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES team(id),
  week_id INTEGER NOT NULL REFERENCES week(id),
  category TEXT NOT NULL CHECK (category IN ('work','participation','voice','positivity')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_award_week_team ON award(week_id, team_id);

CREATE TABLE IF NOT EXISTS week_score (
  week_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  work INTEGER NOT NULL DEFAULT 0,
  participation INTEGER NOT NULL DEFAULT 0,
  voice INTEGER NOT NULL DEFAULT 0,
  positivity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week_id, team_id)
);

CREATE TABLE IF NOT EXISTS login_attempt (
  ip TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

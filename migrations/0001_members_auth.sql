-- The Wall of Shame: member logins, sessions and login log.
-- All timestamps are unix epoch milliseconds (UTC).

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  last_seen_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_events_at ON login_events(at);
CREATE INDEX IF NOT EXISTS idx_login_events_user_at ON login_events(username COLLATE NOCASE, at);
CREATE INDEX IF NOT EXISTS idx_login_events_ip_at ON login_events(ip, at);

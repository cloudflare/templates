CREATE TABLE IF NOT EXISTS domains (
  fqdn TEXT PRIMARY KEY,
  added_at INTEGER NOT NULL,
  cadence_minutes INTEGER NOT NULL,
  phase_offset_minutes INTEGER NOT NULL,
  next_due_at INTEGER NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  last_status TEXT,
  last_status_changed_at INTEGER,
  last_checked_at INTEGER,
  pending_confirm_status TEXT,
  pending_confirm_count INTEGER DEFAULT 0,
  notify_on TEXT NOT NULL,
  label TEXT,
  tld_supported INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_domains_due ON domains(next_due_at) WHERE paused = 0 AND tld_supported = 1;

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  target TEXT NOT NULL,
  label TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  last_delivery_result TEXT,
  last_delivery_at INTEGER
);

CREATE TABLE IF NOT EXISTS domain_channels (
  fqdn TEXT NOT NULL REFERENCES domains(fqdn) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  PRIMARY KEY (fqdn, channel_id)
);

CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL);

INSERT OR IGNORE INTO config (k, v) VALUES ('default_cadence_minutes', '5');
INSERT OR IGNORE INTO config (k, v) VALUES ('global_paused', '0');
INSERT OR IGNORE INTO config (k, v) VALUES ('version', '1');

-- Users allowlist. Email is primary key. user_id is a stable opaque UUID used as WebAuthn userHandle.
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  added_at INTEGER NOT NULL,
  last_login_at INTEGER,
  disabled INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'admin'
);
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);

-- Login codes. code_hash is SHA-256 of the 6-digit plaintext; plaintext only in the email body + user's memory.
CREATE TABLE IF NOT EXISTS login_codes (
  code_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  verify_attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_login_codes_email ON login_codes(email);
CREATE INDEX IF NOT EXISTS idx_login_codes_expires ON login_codes(expires_at);

-- Active sessions. session_id is random 32 bytes base64url, unique.
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  auth_method TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

-- WebAuthn public keys. One row per registered passkey per user.
CREATE TABLE IF NOT EXISTS passkeys (
  credential_id TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_name TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  transports TEXT
);
CREATE INDEX IF NOT EXISTS idx_passkeys_email ON passkeys(email);

-- Rate-limit log. Subject-type column prevents email/ip namespace collision.
-- Autoincrement PK avoids same-ms collision on (subject_type, subject_key, ts) tuple.
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  ts INTEGER NOT NULL,
  event_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_subject_ts ON login_attempts(subject_type, subject_key, ts);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ts ON login_attempts(ts);

-- Durable auth-event audit log (separate from KV events ring; longer retention for forensics).
CREATE TABLE IF NOT EXISTS auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  email TEXT,
  event_type TEXT NOT NULL,
  auth_method TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_events_ts ON auth_events(ts);
CREATE INDEX IF NOT EXISTS idx_auth_events_email_ts ON auth_events(email, ts);

-- Ephemeral WebAuthn challenges (5-min TTL). Keyed by session or temp cookie id.
CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge_id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  purpose TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges(expires_at);

-- Audit metadata for app.* config keys. Companion to the config k/v table.
-- Cascade-deletes when the config row is removed (empty-value PUT = DELETE).
CREATE TABLE IF NOT EXISTS config_meta (
  k TEXT PRIMARY KEY REFERENCES config(k) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_config_meta_updated_at ON config_meta(updated_at);

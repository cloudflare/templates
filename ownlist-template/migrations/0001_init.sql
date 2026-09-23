-- Newsletter subscribers. Opt-in mode is chosen at runtime via the
-- DOUBLE_OPT_IN variable; 'pending' is only used when double opt-in is on.
CREATE TABLE IF NOT EXISTS subscribers (
  email         TEXT PRIMARY KEY,
  name          TEXT,
  status        TEXT NOT NULL DEFAULT 'subscribed', -- subscribed | pending | unsubscribed
  unsub_token   TEXT NOT NULL,
  confirm_token TEXT,                               -- set while status = 'pending'
  data          TEXT,                               -- JSON of any extra fields (see src/fields.ts)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unsub_token ON subscribers (unsub_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_confirm_token ON subscribers (confirm_token);

-- Lightweight send log.
CREATE TABLE IF NOT EXISTS campaigns (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject    TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Feed items already auto-sent, so RSS auto-send never emails the same post twice.
CREATE TABLE IF NOT EXISTS sent_posts (
  item_id TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

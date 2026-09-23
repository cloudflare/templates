-- Queued background sending. Campaigns now store the message body; the
-- outbox holds one row per recipient. A minutely cron drains it in
-- SEND_BATCH-sized runs, so each Worker invocation stays inside the free
-- plan's subrequest limits no matter how large the list is — and sends
-- survive crashes, retry failures, and skip anyone who unsubscribed while
-- queued.
ALTER TABLE campaigns ADD COLUMN body_html TEXT;
ALTER TABLE campaigns ADD COLUMN base_url TEXT;

CREATE TABLE IF NOT EXISTS outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  email       TEXT NOT NULL,
  name        TEXT,
  unsub_token TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | sending | failed (sent rows are deleted)
  attempts    INTEGER NOT NULL DEFAULT 0,
  claimed_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_claim ON outbox (status, id);

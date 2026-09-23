-- Consent and opt-out audit trail: records when a subscriber confirmed
-- (double opt-in) and when they opted out — the proof anti-spam and privacy
-- laws (US CAN-SPAM, GDPR accountability) expect a sender to keep.
ALTER TABLE subscribers ADD COLUMN confirmed_at TEXT;
ALTER TABLE subscribers ADD COLUMN unsubscribed_at TEXT;

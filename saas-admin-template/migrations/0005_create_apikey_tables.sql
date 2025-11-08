-- Migration number: 0005    2025-11-07T01:00:00.000Z
-- BetterAuth API Key Plugin Tables

DROP TABLE IF EXISTS apiKey;

-- API Keys table
CREATE TABLE apiKey (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    userId INTEGER NOT NULL,
    expiresAt INTEGER,
    -- Rate limiting fields
    rateLimit INTEGER,
    rateLimitWindow INTEGER,
    lastUsedAt INTEGER,
    -- Usage tracking fields
    totalRequests INTEGER NOT NULL DEFAULT 0,
    remainingRequests INTEGER,
    -- Metadata
    ipAddress TEXT,
    userAgent TEXT,
    -- Timestamps
    createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
    updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX idx_apiKey_key ON apiKey(key);
CREATE INDEX idx_apiKey_userId ON apiKey(userId);
CREATE INDEX idx_apiKey_expiresAt ON apiKey(expiresAt);
CREATE INDEX idx_apiKey_lastUsedAt ON apiKey(lastUsedAt);

-- Trigger to auto-update updatedAt
CREATE TRIGGER update_apiKey_updatedAt
    AFTER UPDATE ON apiKey
    BEGIN
        UPDATE apiKey
        SET updatedAt = unixepoch()
        WHERE id = NEW.id;
    END;

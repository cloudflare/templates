-- Migration number: 0004    2025-11-07T00:00:00.000Z
-- BetterAuth Authentication Tables

DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS user;

-- Users table
CREATE TABLE user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER DEFAULT 0,
    image TEXT,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
    updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Sessions table
CREATE TABLE session (
    id TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    ipAddress TEXT,
    userAgent TEXT,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
    updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

-- Accounts table (for OAuth providers)
CREATE TABLE account (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    expiresAt INTEGER,
    password TEXT,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
    updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(providerId, accountId)
);

-- Verification table (for email verification, password reset)
CREATE TABLE verification (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
    updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Create indexes for better performance
CREATE INDEX idx_user_email ON user(email);
CREATE INDEX idx_session_userId ON session(userId);
CREATE INDEX idx_session_token ON session(token);
CREATE INDEX idx_account_userId ON account(userId);
CREATE INDEX idx_account_provider ON account(providerId, accountId);
CREATE INDEX idx_verification_identifier ON verification(identifier);

-- Triggers to auto-update updatedAt
CREATE TRIGGER update_user_updatedAt
    AFTER UPDATE ON user
    BEGIN
        UPDATE user
        SET updatedAt = unixepoch()
        WHERE id = NEW.id;
    END;

CREATE TRIGGER update_session_updatedAt
    AFTER UPDATE ON session
    BEGIN
        UPDATE session
        SET updatedAt = unixepoch()
        WHERE id = NEW.id;
    END;

CREATE TRIGGER update_account_updatedAt
    AFTER UPDATE ON account
    BEGIN
        UPDATE account
        SET updatedAt = unixepoch()
        WHERE id = NEW.id;
    END;

CREATE TRIGGER update_verification_updatedAt
    AFTER UPDATE ON verification
    BEGIN
        UPDATE verification
        SET updatedAt = unixepoch()
        WHERE id = NEW.id;
    END;

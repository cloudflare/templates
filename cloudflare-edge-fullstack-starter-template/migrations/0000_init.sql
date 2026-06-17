-- Schema for the Edge Full-Stack Starter.
--
-- The auth tables (user / account / verification) and the app table (notes)
-- live in ONE D1 database, so `notes.user_id` is a real foreign key into
-- `user(id)` and deleting a user cascades their notes.
--
-- There is intentionally NO `session` table: sessions live in KV only (cheaper,
-- faster — see the README). The Worker also recreates these tables on first
-- request if they're missing (server/ensure-schema.ts), so a freshly-deployed
-- D1 works without anyone running migrations. This file exists for the
-- standard `wrangler d1 migrations apply` workflow and as documentation.

CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "email_verified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" INTEGER,
  "refresh_token_expires_at" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "created_at" INTEGER,
  "updated_at" INTEGER
);

CREATE TABLE IF NOT EXISTS "notes" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "attachment_key" TEXT,
  "attachment_name" TEXT,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS "notes_user_created_idx" ON "notes" ("user_id", "created_at" DESC);

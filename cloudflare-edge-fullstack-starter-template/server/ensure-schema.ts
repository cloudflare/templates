// Idempotent schema bootstrap.
//
// The Deploy-to-Cloudflare button provisions a brand-new, EMPTY D1. Rather than
// depend on a migration running at exactly the right moment during the deploy,
// the Worker creates its tables on the first request if they're missing. This
// makes a fresh deploy "just work" with zero setup. It runs once per isolate
// (guarded by a module-level promise), and every statement is `IF NOT EXISTS`,
// so the steady-state cost is a single resolved-promise await per request.

import type { Bindings } from "./env.ts";

const DDL = [
	`CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" INTEGER NOT NULL DEFAULT 0,
    "image" TEXT,
    "created_at" INTEGER NOT NULL,
    "updated_at" INTEGER NOT NULL
  )`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email")`,
	`CREATE TABLE IF NOT EXISTS "account" (
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
  )`,
	`CREATE TABLE IF NOT EXISTS "verification" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" INTEGER NOT NULL,
    "created_at" INTEGER,
    "updated_at" INTEGER
  )`,
	`CREATE TABLE IF NOT EXISTS "notes" (
    "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "content" TEXT NOT NULL,
    "attachment_key" TEXT,
    "attachment_name" TEXT,
    "created_at" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    "updated_at" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
	`CREATE INDEX IF NOT EXISTS "notes_user_created_idx" ON "notes" ("user_id", "created_at" DESC)`,
];

let ensured: Promise<void> | null = null;

export function ensureSchema(env: Bindings): Promise<void> {
	if (!ensured) {
		ensured = (async () => {
			// One atomic batch — D1 runs `;`-less prepared statements together.
			await env.DB.batch(DDL.map((sql) => env.DB.prepare(sql)));
		})().catch((err) => {
			// Reset so a transient failure (e.g. cold-start race) retries next request
			// rather than poisoning the isolate permanently.
			ensured = null;
			throw err;
		});
	}
	return ensured;
}

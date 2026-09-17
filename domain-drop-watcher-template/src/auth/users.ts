import type { D1Database } from "@cloudflare/workers-types";

export interface UserRow {
  email: string;
  userId: string;
  addedAt: number;
  lastLoginAt: number | null;
  disabled: boolean;
  role: string;
}

export class UserExistsError extends Error {
  constructor(email: string) {
    super(`User already exists: ${email}`);
    this.name = "UserExistsError";
  }
}

interface RawUserRow {
  email: string;
  user_id: string;
  added_at: number;
  last_login_at: number | null;
  disabled: number;
  role: string;
}

function mapRow(raw: RawUserRow): UserRow {
  return {
    email: raw.email,
    userId: raw.user_id,
    addedAt: raw.added_at,
    lastLoginAt: raw.last_login_at ?? null,
    disabled: raw.disabled !== 0,
    role: raw.role,
  };
}

export async function listUsers(db: D1Database): Promise<UserRow[]> {
  const result = await db
    .prepare("SELECT email, user_id, added_at, last_login_at, disabled, role FROM users ORDER BY added_at ASC")
    .all<RawUserRow>();
  return result.results.map(mapRow);
}

export async function getUser(db: D1Database, email: string): Promise<UserRow | null> {
  const lower = email.toLowerCase();
  const raw = await db
    .prepare("SELECT email, user_id, added_at, last_login_at, disabled, role FROM users WHERE email = ?")
    .bind(lower)
    .first<RawUserRow>();
  return raw ? mapRow(raw) : null;
}

export async function getUserByUserId(db: D1Database, userId: string): Promise<UserRow | null> {
  const raw = await db
    .prepare("SELECT email, user_id, added_at, last_login_at, disabled, role FROM users WHERE user_id = ?")
    .bind(userId)
    .first<RawUserRow>();
  return raw ? mapRow(raw) : null;
}

export async function addUser(
  db: D1Database,
  email: string,
  now: number,
  role = "admin",
): Promise<UserRow> {
  const lower = email.toLowerCase();
  const userId = crypto.randomUUID();

  const result = await db
    .prepare(
      "INSERT INTO users (email, user_id, added_at, last_login_at, disabled, role) VALUES (?, ?, ?, NULL, 0, ?)",
    )
    .bind(lower, userId, now, role)
    .run();

  if (!result.success || result.meta.changes === 0) {
    throw new UserExistsError(lower);
  }

  return {
    email: lower,
    userId,
    addedAt: now,
    lastLoginAt: null,
    disabled: false,
    role,
  };
}

export async function removeUser(db: D1Database, email: string): Promise<boolean> {
  const lower = email.toLowerCase();
  const result = await db
    .prepare("DELETE FROM users WHERE email = ?")
    .bind(lower)
    .run();
  return result.meta.changes > 0;
}

export async function setUserDisabled(
  db: D1Database,
  email: string,
  disabled: boolean,
): Promise<boolean> {
  const lower = email.toLowerCase();
  const result = await db
    .prepare("UPDATE users SET disabled = ? WHERE email = ?")
    .bind(disabled ? 1 : 0, lower)
    .run();
  return result.meta.changes > 0;
}

export async function recordUserLogin(db: D1Database, email: string, now: number): Promise<void> {
  const lower = email.toLowerCase();
  await db
    .prepare("UPDATE users SET last_login_at = ? WHERE email = ?")
    .bind(now, lower)
    .run();
}

export async function userCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS cnt FROM users")
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../types.js";

const COOKIE_NAME = "dropwatch_session";
const SESSION_TTL_SECONDS = 43200;
const COOKIE_STRICT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------
// HMAC helpers
// ---------------------------------------------------------------------------

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function bufToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToBuf(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    str.length + ((4 - (str.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf;
}

async function hmacSign(sessionId: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(sessionId));
  return bufToBase64url(sig);
}

// Constant-time compare: XOR-accumulate over equal-length byte arrays.
// Lengths-differ short-circuit is intentional (no timing leak on length mismatch).
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i]! ^ b[i]!);
  }
  return diff === 0;
}

async function hmacVerify(sessionId: string, sig: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(sessionId, secret);
  const expectedBytes = new TextEncoder().encode(expected);
  const givenBytes = new TextEncoder().encode(sig);
  return constantTimeEqual(expectedBytes, givenBytes);
}

// ---------------------------------------------------------------------------
// Session interface
// ---------------------------------------------------------------------------

export interface SessionRow {
  session_id: string;
  email: string;
  created_at: number;
  expires_at: number;
  user_agent: string | null;
  ip_address: string | null;
  auth_method: string;
}

export interface SessionIdentity {
  email: string;
  authMethod: string;
  sessionId: string;
}

export interface CreateSessionParams {
  email: string;
  authMethod: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface CreateSessionResult {
  sessionId: string;
  cookieValue: string;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

export async function createSession(
  env: Env,
  db: D1Database,
  params: CreateSessionParams,
): Promise<CreateSessionResult> {
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);
  const sessionId = bufToBase64url(rawBytes.buffer);

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;

  await db
    .prepare(
      `INSERT INTO sessions (session_id, email, created_at, expires_at, user_agent, ip_address, auth_method)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      sessionId,
      params.email,
      now,
      expiresAt,
      params.userAgent ?? null,
      params.ipAddress ?? null,
      params.authMethod,
    )
    .run();

  const sig = await hmacSign(sessionId, env.SESSION_SECRET);
  const cookieValue = `${sessionId}.${sig}`;

  return { sessionId, cookieValue, expiresAt };
}

// ---------------------------------------------------------------------------
// verifySessionCookie
// ---------------------------------------------------------------------------

export async function verifySessionCookie(
  env: Env,
  db: D1Database,
  cookieHeaderValue: string,
): Promise<SessionIdentity | null> {
  if (!COOKIE_STRICT_RE.test(cookieHeaderValue)) return null;

  const parts = cookieHeaderValue.split(".");
  if (parts.length !== 2) return null;

  const [sessionId, sig] = parts as [string, string];

  const valid = await hmacVerify(sessionId, sig, env.SESSION_SECRET);
  if (!valid) return null;

  const now = Math.floor(Date.now() / 1000);

  const session = await db
    .prepare(
      `SELECT s.session_id, s.email, s.auth_method, s.expires_at, u.disabled
       FROM sessions s
       JOIN users u ON u.email = s.email
       WHERE s.session_id = ? AND s.expires_at > ?`,
    )
    .bind(sessionId, now)
    .first<{ session_id: string; email: string; auth_method: string; expires_at: number; disabled: number }>();

  if (!session) return null;
  if (session.disabled !== 0) return null;

  return {
    email: session.email,
    authMethod: session.auth_method,
    sessionId: session.session_id,
  };
}

// ---------------------------------------------------------------------------
// revokeSession
// ---------------------------------------------------------------------------

export async function revokeSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE session_id = ?`).bind(sessionId).run();
}

// ---------------------------------------------------------------------------
// Cookie serialization
// ---------------------------------------------------------------------------

export function serializeSessionCookie(value: string): string {
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../types.js";
import { getAlertFromAddress } from "../env-config.js";

export function generateLoginCode(): string {
  const LIMIT = 4_294_967_000;
  const MOD = 1_000_000;
  while (true) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const val = buf[0];
    if (val === undefined || val >= LIMIT) continue;
    return String(val % MOD).padStart(6, "0");
  }
}

export async function hashLoginCode(
  env: Env,
  email: string,
  code: string,
): Promise<string> {
  const input = `code=${code}|email=${email.toLowerCase()}|secret=${env.SESSION_SECRET}`;
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function issueLoginCode(
  env: Env,
  db: D1Database,
  ctx: { waitUntil: (p: Promise<unknown>) => void },
  email: string,
): Promise<{ codeSent: boolean }> {
  const lower = email.toLowerCase();

  const user = await db
    .prepare("SELECT email, disabled FROM users WHERE email = ?")
    .bind(lower)
    .first<{ email: string; disabled: number }>();

  if (!user || user.disabled !== 0) {
    await db
      .prepare("SELECT email FROM users WHERE email = ?")
      .bind(lower)
      .first();
    return { codeSent: false };
  }

  if (env.DEMO_MODE === "1") {
    const allowed = (env.DEMO_ADMIN_EMAIL || "").toLowerCase();
    if (!allowed || lower !== allowed) {
      return { codeSent: false };
    }
  }

  const code = generateLoginCode();
  const hash = await hashLoginCode(env, lower, code);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 600;

  await db
    .prepare(
      "INSERT INTO login_codes (code_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(hash, lower, now, expiresAt)
    .run();

  const from = await getAlertFromAddress(env, db) ?? "";
  if (env.EMAIL_STUB === "1") {
    await env.BOOTSTRAP.put(`stub-code:${lower}`, code, { expirationTtl: 600 });
  } else {
    ctx.waitUntil(env.EMAIL!.send({
      from,
      to: lower,
      subject: `domain-drop-watcher sign-in code: ${code}`,
      text: `Your 6-digit code: ${code}\n\nExpires in 10 minutes. Ignore if you didn't request sign-in. No links to click.`,
    }));
  }

  return { codeSent: true };
}

export async function redeemLoginCode(
  env: Env,
  db: D1Database,
  email: string,
  code: string,
): Promise<
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "used" | "attempts_exhausted" }
> {
  const lower = email.toLowerCase();
  const hash = await hashLoginCode(env, lower, code);
  const now = Math.floor(Date.now() / 1000);

  const row = await db
    .prepare(
      "SELECT code_hash, expires_at, used_at, verify_attempts FROM login_codes WHERE code_hash = ? AND email = ? AND used_at IS NULL",
    )
    .bind(hash, lower)
    .first<{
      code_hash: string;
      expires_at: number;
      used_at: number | null;
      verify_attempts: number;
    }>();

  if (!row) {
    await db
      .prepare(
        "UPDATE login_codes SET verify_attempts = verify_attempts + 1 WHERE code_hash = ?",
      )
      .bind(hash)
      .run();
    return { ok: false, reason: "not_found" };
  }

  if (row.expires_at < now) {
    await db
      .prepare(
        "UPDATE login_codes SET verify_attempts = verify_attempts + 1 WHERE code_hash = ?",
      )
      .bind(hash)
      .run();
    return { ok: false, reason: "expired" };
  }

  if (row.verify_attempts >= 5) {
    return { ok: false, reason: "attempts_exhausted" };
  }

  const result = await db
    .prepare(
      "UPDATE login_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL",
    )
    .bind(now, hash)
    .run();

  if (result.meta.changes === 0) {
    return { ok: false, reason: "used" };
  }

  return { ok: true };
}

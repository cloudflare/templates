export type LoginAttemptEvent =
  | "code_sent"
  | "code_verify_fail"
  | "code_verify_ok"
  | "passkey_fail"
  | "passkey_ok";

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSec?: number;
  reason?: string;
}

interface CountRow {
  n: number;
}

export async function checkSendCodeRate(
  db: D1Database,
  email: string,
  ip: string,
  now: number,
): Promise<RateLimitDecision> {
  const normalEmail = email.toLowerCase();

  const burstWindow = now - 900;
  const dailyWindow = now - 86_400;
  const ipWindow = now - 3_600;

  const burstRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM login_attempts
       WHERE subject_type = 'email' AND subject_key = ?
         AND ts > ?
         AND event_type IN ('code_sent', 'code_verify_fail')`,
    )
    .bind(normalEmail, burstWindow)
    .first<CountRow>();

  if ((burstRow?.n ?? 0) >= 3) {
    return { allowed: false, retryAfterSec: 900, reason: "per-email burst cap" };
  }

  const dailyRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM login_attempts
       WHERE subject_type = 'email' AND subject_key = ?
         AND ts > ?
         AND event_type IN ('code_sent', 'code_verify_fail')`,
    )
    .bind(normalEmail, dailyWindow)
    .first<CountRow>();

  if ((dailyRow?.n ?? 0) >= 20) {
    return { allowed: false, retryAfterSec: 14_400, reason: "per-email daily cap" };
  }

  const ipRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM login_attempts
       WHERE subject_type = 'ip' AND subject_key = ?
         AND ts > ?`,
    )
    .bind(ip, ipWindow)
    .first<CountRow>();

  if ((ipRow?.n ?? 0) >= 50) {
    return { allowed: false, retryAfterSec: 3_600, reason: "per-IP hour cap" };
  }

  return { allowed: true };
}

export async function checkVerifyCodeRate(
  db: D1Database,
  email: string,
  now: number,
): Promise<RateLimitDecision> {
  const normalEmail = email.toLowerCase();
  const window = now - 600;

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM login_attempts
       WHERE subject_type = 'email' AND subject_key = ?
         AND ts > ?
         AND event_type = 'code_verify_fail'`,
    )
    .bind(normalEmail, window)
    .first<CountRow>();

  if ((row?.n ?? 0) >= 5) {
    return { allowed: false, retryAfterSec: 600, reason: "per-email verify-failure cap" };
  }

  return { allowed: true };
}

export async function recordLoginAttempt(
  db: D1Database,
  subjectType: "email" | "ip",
  subjectKey: string,
  event: LoginAttemptEvent,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO login_attempts (subject_type, subject_key, ts, event_type)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(subjectType, subjectKey, now, event)
    .run();
}

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { UserRow } from "./users.js";
import type { Env } from "../types.js";

export interface PasskeyRow {
  credentialId: string;
  email: string;
  publicKey: Uint8Array;
  counter: number;
  deviceName: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  transports: string[] | null;
}

// ---------------------------------------------------------------------------
// RP helpers
// ---------------------------------------------------------------------------

export function rpIdFor(env: Env, requestUrl: string): string {
  if (env.WEBAUTHN_RP_ID) return env.WEBAUTHN_RP_ID;
  return new URL(requestUrl).hostname;
}

export function originFor(requestUrl: string): string {
  const u = new URL(requestUrl);
  return u.origin;
}

// ---------------------------------------------------------------------------
// base64url helpers (Workers-native — no Node Buffer)
// ---------------------------------------------------------------------------

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    str.length + ((4 - (str.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function beginPasskeyRegistration(
  env: Env,
  db: D1Database,
  opts: {
    user: UserRow;
    requestUrl: string;
    challengeId: string;
    now: number;
  },
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { user, requestUrl, challengeId, now } = opts;
  const rpID = rpIdFor(env, requestUrl);

  const uuidHex = user.userId.replace(/-/g, "");
  const buf = new ArrayBuffer(16);
  const uuidBytes = new Uint8Array(buf);
  for (let i = 0; i < 16; i++) {
    uuidBytes[i] = parseInt(uuidHex.slice(i * 2, i * 2 + 2), 16);
  }
  const userIdBytes = uuidBytes;
  const options = await generateRegistrationOptions({
    rpName: "Domain Drop Watcher",
    rpID,
    userName: user.email,
    userID: userIdBytes,
    userDisplayName: user.email,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await db
    .prepare(
      `INSERT INTO auth_challenges (challenge_id, challenge, expires_at, purpose) VALUES (?, ?, ?, ?)`,
    )
    .bind(challengeId, options.challenge, now + 300, "register")
    .run();

  return options;
}

export async function finishPasskeyRegistration(
  env: Env,
  db: D1Database,
  opts: {
    user: UserRow;
    requestUrl: string;
    challengeId: string;
    attestationResponse: RegistrationResponseJSON;
    deviceName: string | null;
    now: number;
  },
): Promise<{ ok: true; credentialId: string } | { ok: false; reason: string }> {
  const { user, requestUrl, challengeId, attestationResponse, deviceName, now } = opts;

  const challengeRow = await db
    .prepare(`SELECT challenge, expires_at FROM auth_challenges WHERE challenge_id = ? AND purpose = ?`)
    .bind(challengeId, "register")
    .first<{ challenge: string; expires_at: number }>();

  await db
    .prepare(`DELETE FROM auth_challenges WHERE challenge_id = ?`)
    .bind(challengeId)
    .run();

  if (!challengeRow) return { ok: false, reason: "no_challenge" };
  if (challengeRow.expires_at < now) return { ok: false, reason: "challenge_expired" };

  const expectedOrigin = originFor(requestUrl);
  const expectedRPID = rpIdFor(env, requestUrl);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin,
      expectedRPID,
    });
  } catch {
    return { ok: false, reason: "verify_failed" };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, reason: "verify_failed" };
  }

  const { credential } = verification.registrationInfo;
  const credentialId = credential.id;
  const publicKeyBytes = credential.publicKey;
  const counter = credential.counter;
  const transports = credential.transports ? JSON.stringify(credential.transports) : null;

  await db
    .prepare(
      `INSERT INTO passkeys (credential_id, email, public_key, counter, device_name, created_at, last_used_at, transports)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(
      credentialId,
      user.email,
      publicKeyBytes,
      counter,
      deviceName,
      now,
      transports,
    )
    .run();

  return { ok: true, credentialId };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function beginPasskeyLogin(
  env: Env,
  db: D1Database,
  opts: {
    requestUrl: string;
    tempId: string;
    now: number;
  },
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { requestUrl, tempId, now } = opts;
  const rpID = rpIdFor(env, requestUrl);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });

  await db
    .prepare(
      `INSERT INTO auth_challenges (challenge_id, challenge, expires_at, purpose) VALUES (?, ?, ?, ?)`,
    )
    .bind(tempId, options.challenge, now + 300, "auth")
    .run();

  return options;
}

export async function finishPasskeyLogin(
  env: Env,
  db: D1Database,
  opts: {
    requestUrl: string;
    tempId: string;
    assertionResponse: AuthenticationResponseJSON;
    now: number;
  },
): Promise<
  | { ok: true; user: UserRow }
  | { ok: false; reason: "no_challenge" | "no_credential" | "verify_failed" | "counter_regression" }
> {
  const { requestUrl, tempId, assertionResponse, now } = opts;

  const challengeRow = await db
    .prepare(`SELECT challenge, expires_at FROM auth_challenges WHERE challenge_id = ? AND purpose = ?`)
    .bind(tempId, "auth")
    .first<{ challenge: string; expires_at: number }>();

  await db
    .prepare(`DELETE FROM auth_challenges WHERE challenge_id = ?`)
    .bind(tempId)
    .run();

  if (!challengeRow) return { ok: false, reason: "no_challenge" };
  if (challengeRow.expires_at < now) return { ok: false, reason: "no_challenge" };

  const credentialId = assertionResponse.id;

  const passkeyRow = await db
    .prepare(
      `SELECT credential_id, email, public_key, counter, transports FROM passkeys WHERE credential_id = ?`,
    )
    .bind(credentialId)
    .first<{ credential_id: string; email: string; public_key: Uint8Array; counter: number; transports: string | null }>();

  if (!passkeyRow) return { ok: false, reason: "no_credential" };

  const storedCounter = passkeyRow.counter;
  const rawPk = passkeyRow.public_key;
  const pkBuf = new ArrayBuffer((rawPk as unknown as { byteLength: number }).byteLength ?? 0);
  const pkArr = new Uint8Array(pkBuf);
  const srcArr = rawPk instanceof Uint8Array ? rawPk : new Uint8Array(rawPk as unknown as ArrayBuffer);
  pkArr.set(srcArr);
  const publicKey: Uint8Array<ArrayBuffer> = pkArr;

  let transports: AuthenticatorTransportFuture[] | undefined;
  if (passkeyRow.transports) {
    try {
      transports = JSON.parse(passkeyRow.transports) as AuthenticatorTransportFuture[];
    } catch {
      transports = undefined;
    }
  }

  const expectedOrigin = originFor(requestUrl);
  const expectedRPID = rpIdFor(env, requestUrl);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin,
      expectedRPID,
      credential: {
        id: passkeyRow.credential_id,
        publicKey,
        counter: storedCounter,
        transports,
      },
    });
  } catch {
    return { ok: false, reason: "verify_failed" };
  }

  if (!verification.verified) return { ok: false, reason: "verify_failed" };

  const newCounter = verification.authenticationInfo.newCounter;

  if (newCounter < storedCounter) {
    return { ok: false, reason: "counter_regression" };
  }

  await db
    .prepare(`UPDATE passkeys SET counter = ?, last_used_at = ? WHERE credential_id = ?`)
    .bind(newCounter, now, credentialId)
    .run();

  const userRow = await db
    .prepare(
      `SELECT email, user_id, added_at, last_login_at, disabled, role FROM users WHERE email = ?`,
    )
    .bind(passkeyRow.email)
    .first<{ email: string; user_id: string; added_at: number; last_login_at: number | null; disabled: number; role: string }>();

  if (!userRow) return { ok: false, reason: "no_credential" };

  const user: UserRow = {
    email: userRow.email,
    userId: userRow.user_id,
    addedAt: userRow.added_at,
    lastLoginAt: userRow.last_login_at,
    disabled: userRow.disabled !== 0,
    role: userRow.role,
  };

  return { ok: true, user };
}

// ---------------------------------------------------------------------------
// Listing / removal
// ---------------------------------------------------------------------------

export async function listPasskeysForUser(db: D1Database, email: string): Promise<PasskeyRow[]> {
  const rows = await db
    .prepare(
      `SELECT credential_id, email, public_key, counter, device_name, created_at, last_used_at, transports
       FROM passkeys WHERE email = ? ORDER BY created_at ASC`,
    )
    .bind(email.toLowerCase())
    .all<{
      credential_id: string;
      email: string;
      public_key: Uint8Array;
      counter: number;
      device_name: string | null;
      created_at: number;
      last_used_at: number | null;
      transports: string | null;
    }>();

  return rows.results.map((r) => ({
    credentialId: r.credential_id,
    email: r.email,
    publicKey: r.public_key instanceof Uint8Array ? r.public_key : new Uint8Array(r.public_key as unknown as ArrayBuffer),
    counter: r.counter,
    deviceName: r.device_name,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    transports: r.transports ? (() => { try { return JSON.parse(r.transports!) as string[]; } catch { return null; } })() : null,
  }));
}

export async function removePasskey(db: D1Database, credentialId: string, ownerEmail: string): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM passkeys WHERE credential_id = ? AND email = ?`)
    .bind(credentialId, ownerEmail.toLowerCase())
    .run();
  return result.meta.changes > 0;
}

// ---------------------------------------------------------------------------
// Type imports for compatibility (not exported at runtime)
// ---------------------------------------------------------------------------

type PublicKeyCredentialCreationOptionsJSON = Awaited<ReturnType<typeof generateRegistrationOptions>>;
type PublicKeyCredentialRequestOptionsJSON = Awaited<ReturnType<typeof generateAuthenticationOptions>>;
type RegistrationResponseJSON = Parameters<typeof verifyRegistrationResponse>[0]["response"];
type AuthenticationResponseJSON = Parameters<typeof verifyAuthenticationResponse>[0]["response"];
type AuthenticatorTransportFuture = NonNullable<Parameters<typeof verifyAuthenticationResponse>[0]["credential"]["transports"]>[number];

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../src/types.js";

// ---------------------------------------------------------------------------
// Mock @simplewebauthn/server before importing passkey module
// ---------------------------------------------------------------------------

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

import {
  beginPasskeyRegistration,
  finishPasskeyRegistration,
  beginPasskeyLogin,
  finishPasskeyLogin,
  listPasskeysForUser,
  removePasskey,
  rpIdFor,
  originFor,
} from "../src/auth/passkey.js";

// ---------------------------------------------------------------------------
// In-memory D1 for passkeys + auth_challenges + users + passkeys
// ---------------------------------------------------------------------------

interface Row {
  [key: string]: unknown;
}

function makePasskeyD1(): D1Database & { _tables: { passkeys: Row[]; auth_challenges: Row[]; users: Row[] } } {
  const tables: { passkeys: Row[]; auth_challenges: Row[]; users: Row[] } = {
    passkeys: [],
    auth_challenges: [],
    users: [],
  };

  function executeSQL(sql: string, bindings: unknown[]): { results: Row[]; changes: number } {
    const lower = sql.toLowerCase().trim();

    if (lower.startsWith("select")) {
      if (lower.includes("from auth_challenges")) {
        const challengeId = bindings[0] as string;
        const purpose = bindings[1] as string;
        const row = tables.auth_challenges.find(
          (r) => r["challenge_id"] === challengeId && r["purpose"] === purpose,
        ) ?? null;
        return { results: row ? [row] : [], changes: 0 };
      }
      if (lower.includes("from passkeys") && lower.includes("where credential_id")) {
        const credId = bindings[0] as string;
        const row = tables.passkeys.find((r) => r["credential_id"] === credId) ?? null;
        return { results: row ? [row] : [], changes: 0 };
      }
      if (lower.includes("from passkeys") && lower.includes("where email")) {
        const email = bindings[0] as string;
        const rows = tables.passkeys.filter((r) => r["email"] === email);
        return { results: rows, changes: 0 };
      }
      if (lower.includes("from users") && lower.includes("where email")) {
        const email = bindings[0] as string;
        const row = tables.users.find((r) => r["email"] === email) ?? null;
        return { results: row ? [row] : [], changes: 0 };
      }
      return { results: [], changes: 0 };
    }

    if (lower.startsWith("insert")) {
      if (lower.includes("into auth_challenges")) {
        tables.auth_challenges.push({
          challenge_id: bindings[0] as string,
          challenge: bindings[1] as string,
          expires_at: bindings[2] as number,
          purpose: bindings[3] as string,
        });
        return { results: [], changes: 1 };
      }
      if (lower.includes("into passkeys")) {
        tables.passkeys.push({
          credential_id: bindings[0] as string,
          email: bindings[1] as string,
          public_key: bindings[2] as Uint8Array,
          counter: bindings[3] as number,
          device_name: bindings[4] as string | null,
          created_at: bindings[5] as number,
          last_used_at: null,
          transports: bindings[6] as string | null,
        });
        return { results: [], changes: 1 };
      }
      return { results: [], changes: 0 };
    }

    if (lower.startsWith("update")) {
      if (lower.includes("passkeys") && lower.includes("counter")) {
        const newCounter = bindings[0] as number;
        const lastUsedAt = bindings[1] as number;
        const credId = bindings[2] as string;
        let changed = 0;
        tables.passkeys.forEach((r) => {
          if (r["credential_id"] === credId) {
            r["counter"] = newCounter;
            r["last_used_at"] = lastUsedAt;
            changed++;
          }
        });
        return { results: [], changes: changed };
      }
      return { results: [], changes: 0 };
    }

    if (lower.startsWith("delete")) {
      if (lower.includes("from auth_challenges")) {
        const challengeId = bindings[0] as string;
        const before = tables.auth_challenges.length;
        tables.auth_challenges = tables.auth_challenges.filter((r) => r["challenge_id"] !== challengeId);
        return { results: [], changes: before - tables.auth_challenges.length };
      }
      if (lower.includes("from passkeys") && lower.includes("credential_id") && lower.includes("email")) {
        const credId = bindings[0] as string;
        const email = bindings[1] as string;
        const before = tables.passkeys.length;
        tables.passkeys = tables.passkeys.filter((r) => !(r["credential_id"] === credId && r["email"] === email));
        return { results: [], changes: before - tables.passkeys.length };
      }
      return { results: [], changes: 0 };
    }

    return { results: [], changes: 0 };
  }

  function makeStmt(sql: string, bindings: unknown[]) {
    return {
      bind: (...args: unknown[]) => makeStmt(sql, args),
      run: async () => {
        const res = executeSQL(sql, bindings);
        return {
          success: true,
          results: res.results,
          meta: { changes: res.changes, last_row_id: 0, duration: 0, rows_read: 0, rows_written: 0, size_after: 0, changed_db: false },
        };
      },
      first: async <T = unknown>() => {
        const res = executeSQL(sql, bindings);
        return (res.results[0] ?? null) as T | null;
      },
      all: async <T = unknown>() => {
        const res = executeSQL(sql, bindings);
        return { success: true, results: res.results as T[], meta: { changes: res.changes, last_row_id: 0, duration: 0, rows_read: 0, rows_written: 0, size_after: 0, changed_db: false } };
      },
      raw: async <T = unknown>() => {
        const res = executeSQL(sql, bindings);
        return res.results.map((r) => Object.values(r)) as T[];
      },
    };
  }

  const db = {
    prepare: (sql: string) => makeStmt(sql, []),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    batch: async () => [],
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
    _tables: tables,
  } as unknown as D1Database & { _tables: { passkeys: Row[]; auth_challenges: Row[]; users: Row[] } };

  return db;
}

function makeEnv(): Env {
  return {
    DB: makePasskeyD1() as unknown as D1Database,
    EVENTS: {} as unknown,
    BOOTSTRAP: {} as unknown,
    ADMIN_TOKEN: "test-token",
    SESSION_SECRET: "test-session-secret-placeholder-for-unit-tests",
    WEBHOOK_HOST_ALLOWLIST: "*.webhook.office.com,hooks.slack.com",
    VERSION: "0.1.0-test",
    ALERT_FROM_ADDRESS: "no-reply@example.com",
    EMAIL: { send: async () => {} },
  } as unknown as Env;
}

const TEST_USER = {
  email: "alice@example.com",
  userId: "12345678-1234-1234-1234-123456789012",
  addedAt: 1000,
  lastLoginAt: null,
  disabled: false,
  role: "admin",
};

const REQUEST_URL = "https://example.workers.dev/passkeys/register/begin";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// rpIdFor / originFor helpers
// ---------------------------------------------------------------------------

describe("rpIdFor", () => {
  it("returns WEBAUTHN_RP_ID when set", () => {
    const env = makeEnv();
    env.WEBAUTHN_RP_ID = "my.domain.com";
    expect(rpIdFor(env, "https://example.workers.dev")).toBe("my.domain.com");
  });

  it("extracts hostname from requestUrl when not set", () => {
    const env = makeEnv();
    expect(rpIdFor(env, "https://example.workers.dev")).toBe("example.workers.dev");
  });
});

describe("originFor", () => {
  it("returns exact origin including scheme", () => {
    expect(originFor("https://example.workers.dev/some/path")).toBe("https://example.workers.dev");
  });
});

// ---------------------------------------------------------------------------
// beginPasskeyRegistration
// ---------------------------------------------------------------------------

describe("beginPasskeyRegistration", () => {
  it("returns options with userID = userId bytes (not email), challenge stored in auth_challenges", async () => {
    const mockOptions = { challenge: "test-challenge-abc", rpId: "example.workers.dev", user: { id: "dummyId" } };
    vi.mocked(generateRegistrationOptions).mockResolvedValue(mockOptions as unknown as ReturnType<typeof generateRegistrationOptions> extends Promise<infer T> ? T : never);

    const env = makeEnv();
    const db = env.DB as unknown as ReturnType<typeof makePasskeyD1>;
    const now = 1000;

    const options = await beginPasskeyRegistration(env, db, {
      user: TEST_USER,
      requestUrl: REQUEST_URL,
      challengeId: "challenge-id-1",
      now,
    });

    expect(options.challenge).toBe("test-challenge-abc");

    const callArgs = vi.mocked(generateRegistrationOptions).mock.calls[0]![0]!;
    expect(callArgs.userName).toBe("alice@example.com");
    expect(callArgs.userDisplayName).toBe("alice@example.com");
    expect(callArgs.rpID).toBe("example.workers.dev");
    expect(callArgs.userID).toBeInstanceOf(Uint8Array);
    expect((callArgs.userID as Uint8Array).length).toBe(16);

    const dbTyped = db as unknown as { _tables: { auth_challenges: Row[] } };
    const challengeRow = dbTyped._tables.auth_challenges[0];
    expect(challengeRow).toBeDefined();
    expect(challengeRow!["challenge_id"]).toBe("challenge-id-1");
    expect(challengeRow!["purpose"]).toBe("register");
    expect(challengeRow!["expires_at"]).toBe(now + 300);
  });
});

// ---------------------------------------------------------------------------
// finishPasskeyRegistration
// ---------------------------------------------------------------------------

describe("finishPasskeyRegistration — happy path", () => {
  it("inserts passkeys row, deletes challenge row, returns ok with credentialId", async () => {
    const fakePublicKey = new Uint8Array(new ArrayBuffer(65));
    fakePublicKey[0] = 0x04;

    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "cred-abc123",
          publicKey: fakePublicKey,
          counter: 0,
          transports: ["internal"],
        },
        fmt: "none",
        aaguid: "00000000-0000-0000-0000-000000000000",
        credentialType: "public-key",
        attestationObject: new Uint8Array(0),
        userVerified: true,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        origin: "https://example.workers.dev",
      },
    } as ReturnType<typeof verifyRegistrationResponse> extends Promise<infer T> ? T : never);

    const env = makeEnv();
    const db = env.DB as unknown as ReturnType<typeof makePasskeyD1>;
    const now = 2000;

    const dbTyped = db as unknown as { _tables: { passkeys: Row[]; auth_challenges: Row[] } };
    dbTyped._tables.auth_challenges.push({
      challenge_id: "chal-1",
      challenge: "stored-challenge",
      expires_at: now + 200,
      purpose: "register",
    });

    const result = await finishPasskeyRegistration(env, db, {
      user: TEST_USER,
      requestUrl: REQUEST_URL,
      challengeId: "chal-1",
      attestationResponse: {} as never,
      deviceName: "My Touch ID",
      now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credentialId).toBe("cred-abc123");
    }

    expect(dbTyped._tables.passkeys.length).toBe(1);
    expect(dbTyped._tables.passkeys[0]!["credential_id"]).toBe("cred-abc123");
    expect(dbTyped._tables.passkeys[0]!["device_name"]).toBe("My Touch ID");
    expect(dbTyped._tables.auth_challenges.length).toBe(0);
  });
});

describe("finishPasskeyRegistration — challenge expired", () => {
  it("returns ok:false reason challenge_expired when challenge is past expiry", async () => {
    const env = makeEnv();
    const db = env.DB as unknown as ReturnType<typeof makePasskeyD1>;
    const now = 5000;

    const dbTyped = db as unknown as { _tables: { auth_challenges: Row[] } };
    dbTyped._tables.auth_challenges.push({
      challenge_id: "expired-chal",
      challenge: "old-challenge",
      expires_at: now - 1,
      purpose: "register",
    });

    const result = await finishPasskeyRegistration(env, db, {
      user: TEST_USER,
      requestUrl: REQUEST_URL,
      challengeId: "expired-chal",
      attestationResponse: {} as never,
      deviceName: null,
      now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("challenge_expired");
    }
  });
});

// ---------------------------------------------------------------------------
// finishPasskeyLogin — happy path
// ---------------------------------------------------------------------------

describe("finishPasskeyLogin — happy path, counter update 0→7", () => {
  it("accepts, updates counter from 0 to 7", async () => {
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: {
        credentialID: "cred-login-1",
        newCounter: 7,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        origin: "https://example.workers.dev",
        rpID: "example.workers.dev",
      },
    } as ReturnType<typeof verifyAuthenticationResponse> extends Promise<infer T> ? T : never);

    const env = makeEnv();
    const db = env.DB as unknown as ReturnType<typeof makePasskeyD1>;
    const now = 3000;
    const dbTyped = db as unknown as { _tables: { passkeys: Row[]; auth_challenges: Row[]; users: Row[] } };

    dbTyped._tables.auth_challenges.push({
      challenge_id: "auth-chal-1",
      challenge: "auth-challenge",
      expires_at: now + 200,
      purpose: "auth",
    });
    const fakePublicKey = new Uint8Array(new ArrayBuffer(65));
    dbTyped._tables.passkeys.push({
      credential_id: "cred-login-1",
      email: "alice@example.com",
      public_key: fakePublicKey,
      counter: 0,
      transports: null,
    });
    dbTyped._tables.users.push({
      email: "alice@example.com",
      user_id: TEST_USER.userId,
      added_at: 1000,
      last_login_at: null,
      disabled: 0,
      role: "admin",
    });

    const result = await finishPasskeyLogin(env, db, {
      requestUrl: "https://example.workers.dev/login/passkey",
      tempId: "auth-chal-1",
      assertionResponse: { id: "cred-login-1" } as never,
      now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe("alice@example.com");
    }

    const pkRow = dbTyped._tables.passkeys[0]!;
    expect(pkRow["counter"]).toBe(7);
    expect(pkRow["last_used_at"]).toBe(now);
    expect(dbTyped._tables.auth_challenges.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// finishPasskeyLogin — counter regression
// ---------------------------------------------------------------------------

describe("finishPasskeyLogin — counter regression", () => {
  it("returns counter_regression when received(5) < stored(10), counter unchanged", async () => {
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: {
        credentialID: "cred-regress",
        newCounter: 5,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        origin: "https://example.workers.dev",
        rpID: "example.workers.dev",
      },
    } as ReturnType<typeof verifyAuthenticationResponse> extends Promise<infer T> ? T : never);

    const env = makeEnv();
    const db = env.DB as unknown as ReturnType<typeof makePasskeyD1>;
    const now = 4000;
    const dbTyped = db as unknown as { _tables: { passkeys: Row[]; auth_challenges: Row[]; users: Row[] } };

    dbTyped._tables.auth_challenges.push({
      challenge_id: "chal-regress",
      challenge: "ch",
      expires_at: now + 200,
      purpose: "auth",
    });
    const fakePublicKey = new Uint8Array(new ArrayBuffer(65));
    dbTyped._tables.passkeys.push({
      credential_id: "cred-regress",
      email: "alice@example.com",
      public_key: fakePublicKey,
      counter: 10,
      transports: null,
    });

    const result = await finishPasskeyLogin(env, db, {
      requestUrl: "https://example.workers.dev/login/passkey",
      tempId: "chal-regress",
      assertionResponse: { id: "cred-regress" } as never,
      now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("counter_regression");
    }
    expect(dbTyped._tables.passkeys[0]!["counter"]).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// finishPasskeyLogin — counter-at-zero authenticator (0→0 accepted)
// ---------------------------------------------------------------------------

describe("finishPasskeyLogin — counter-at-zero authenticator (0→0 accepted)", () => {
  it("accepts login when stored=0 and received=0", async () => {
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: {
        credentialID: "cred-zero",
        newCounter: 0,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        origin: "https://example.workers.dev",
        rpID: "example.workers.dev",
      },
    } as ReturnType<typeof verifyAuthenticationResponse> extends Promise<infer T> ? T : never);

    const env = makeEnv();
    const db = env.DB as unknown as ReturnType<typeof makePasskeyD1>;
    const now = 5000;
    const dbTyped = db as unknown as { _tables: { passkeys: Row[]; auth_challenges: Row[]; users: Row[] } };

    dbTyped._tables.auth_challenges.push({
      challenge_id: "chal-zero",
      challenge: "ch-zero",
      expires_at: now + 200,
      purpose: "auth",
    });
    const fakePublicKey = new Uint8Array(new ArrayBuffer(65));
    dbTyped._tables.passkeys.push({
      credential_id: "cred-zero",
      email: "alice@example.com",
      public_key: fakePublicKey,
      counter: 0,
      transports: null,
    });
    dbTyped._tables.users.push({
      email: "alice@example.com",
      user_id: TEST_USER.userId,
      added_at: 1000,
      last_login_at: null,
      disabled: 0,
      role: "admin",
    });

    const result = await finishPasskeyLogin(env, db, {
      requestUrl: "https://example.workers.dev/login/passkey",
      tempId: "chal-zero",
      assertionResponse: { id: "cred-zero" } as never,
      now,
    });

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// finishPasskeyLogin — wrong origin (verifyAuthenticationResponse throws)
// ---------------------------------------------------------------------------

describe("finishPasskeyLogin — wrong origin causes verify_failed", () => {
  it("returns verify_failed when verifyAuthenticationResponse throws", async () => {
    vi.mocked(verifyAuthenticationResponse).mockRejectedValue(new Error("Origin mismatch"));

    const env = makeEnv();
    const db = env.DB as unknown as ReturnType<typeof makePasskeyD1>;
    const now = 6000;
    const dbTyped = db as unknown as { _tables: { passkeys: Row[]; auth_challenges: Row[] } };

    dbTyped._tables.auth_challenges.push({
      challenge_id: "chal-origin",
      challenge: "ch-o",
      expires_at: now + 200,
      purpose: "auth",
    });
    const fakePublicKey = new Uint8Array(new ArrayBuffer(65));
    dbTyped._tables.passkeys.push({
      credential_id: "cred-origin",
      email: "alice@example.com",
      public_key: fakePublicKey,
      counter: 0,
      transports: null,
    });

    const result = await finishPasskeyLogin(env, db, {
      requestUrl: "https://example.workers.dev/login/passkey",
      tempId: "chal-origin",
      assertionResponse: { id: "cred-origin" } as never,
      now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("verify_failed");
    }
  });
});

// ---------------------------------------------------------------------------
// removePasskey — cross-user delete prevention
// ---------------------------------------------------------------------------

describe("removePasskey — cross-user delete rejected", () => {
  it("returns false and leaves row intact when email does not match", async () => {
    const env = makeEnv();
    const db = env.DB as unknown as ReturnType<typeof makePasskeyD1>;
    const dbTyped = db as unknown as { _tables: { passkeys: Row[] } };

    dbTyped._tables.passkeys.push({
      credential_id: "cred-owned",
      email: "alice@example.com",
      public_key: new Uint8Array(0),
      counter: 0,
      transports: null,
    });

    const deleted = await removePasskey(db, "cred-owned", "eve@example.com");
    expect(deleted).toBe(false);
    expect(dbTyped._tables.passkeys.length).toBe(1);
  });

  it("returns true and removes row when email matches", async () => {
    const env = makeEnv();
    const db = env.DB as unknown as ReturnType<typeof makePasskeyD1>;
    const dbTyped = db as unknown as { _tables: { passkeys: Row[] } };

    dbTyped._tables.passkeys.push({
      credential_id: "cred-owned",
      email: "alice@example.com",
      public_key: new Uint8Array(0),
      counter: 0,
      transports: null,
    });

    const deleted = await removePasskey(db, "cred-owned", "alice@example.com");
    expect(deleted).toBe(true);
    expect(dbTyped._tables.passkeys.length).toBe(0);
  });
});

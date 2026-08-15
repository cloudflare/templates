import { describe, it, expect } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../src/types.js";
import {
  generateLoginCode,
  hashLoginCode,
  issueLoginCode,
  redeemLoginCode,
} from "../src/auth/magic-link.js";

// ---------------------------------------------------------------------------
// Minimal in-memory D1 mock for users + login_codes tables
// ---------------------------------------------------------------------------

interface UserRow {
  email: string;
  disabled: number;
}

interface LoginCodeRow {
  code_hash: string;
  email: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  verify_attempts: number;
}

function makeMagicLinkD1(opts: {
  users?: UserRow[];
  login_codes?: LoginCodeRow[];
}): D1Database {
  const users: UserRow[] = opts.users ? [...opts.users] : [];
  const codes: LoginCodeRow[] = opts.login_codes ? [...opts.login_codes] : [];

  function executeSQL(
    sql: string,
    bindings: unknown[],
  ): { results: unknown[]; changes: number } {
    const lower = sql.toLowerCase().trim();

    // SELECT ... FROM users WHERE email = ?
    if (lower.startsWith("select") && lower.includes("from users")) {
      const email = bindings[0] as string;
      const row = users.find((u) => u.email === email) ?? null;
      return { results: row ? [row] : [], changes: 0 };
    }

    // INSERT INTO login_codes
    if (lower.startsWith("insert") && lower.includes("into login_codes")) {
      const row: LoginCodeRow = {
        code_hash: bindings[0] as string,
        email: bindings[1] as string,
        created_at: bindings[2] as number,
        expires_at: bindings[3] as number,
        used_at: null,
        verify_attempts: 0,
      };
      codes.push(row);
      return { results: [], changes: 1 };
    }

    // SELECT ... FROM login_codes WHERE code_hash = ? AND email = ? AND used_at IS NULL
    if (lower.startsWith("select") && lower.includes("from login_codes")) {
      const hash = bindings[0] as string;
      const email = bindings[1] as string;
      const row =
        codes.find(
          (c) => c.code_hash === hash && c.email === email && c.used_at === null,
        ) ?? null;
      return { results: row ? [row] : [], changes: 0 };
    }

    // UPDATE login_codes SET verify_attempts = verify_attempts + 1 WHERE code_hash = ?
    if (
      lower.startsWith("update login_codes") &&
      lower.includes("verify_attempts") &&
      !lower.includes("used_at")
    ) {
      const hash = bindings[0] as string;
      let changed = 0;
      for (const c of codes) {
        if (c.code_hash === hash) {
          c.verify_attempts += 1;
          changed++;
        }
      }
      return { results: [], changes: changed };
    }

    // UPDATE login_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL
    if (
      lower.startsWith("update login_codes") &&
      lower.includes("used_at") &&
      lower.includes("where code_hash")
    ) {
      const usedAt = bindings[0] as number;
      const hash = bindings[1] as string;
      let changed = 0;
      for (const c of codes) {
        if (c.code_hash === hash && c.used_at === null) {
          c.used_at = usedAt;
          changed++;
        }
      }
      return { results: [], changes: changed };
    }

    return { results: [], changes: 0 };
  }

  function makeStmt(
    sql: string,
    bindings: unknown[],
  ): ReturnType<D1Database["prepare"]> {
    const stmt = {
      bind: (...args: unknown[]) => makeStmt(sql, args),
      run: async () => {
        const res = executeSQL(sql, bindings);
        return {
          success: true,
          results: res.results,
          meta: {
            changes: res.changes,
            last_row_id: 0,
            duration: 0,
            rows_read: 0,
            rows_written: 0,
            size_after: 0,
            changed_db: false,
          },
        };
      },
      first: async <T = unknown>() => {
        const res = executeSQL(sql, bindings);
        return (res.results[0] ?? null) as T | null;
      },
      all: async <T = unknown>() => {
        const res = executeSQL(sql, bindings);
        return {
          success: true,
          results: res.results as T[],
          meta: {
            changes: res.changes,
            last_row_id: 0,
            duration: 0,
            rows_read: 0,
            rows_written: 0,
            size_after: 0,
            changed_db: false,
          },
        };
      },
      raw: async <T = unknown>() => {
        const res = executeSQL(sql, bindings);
        return res.results.map((r) => Object.values(r as object)) as T[];
      },
    };
    return stmt as unknown as ReturnType<D1Database["prepare"]>;
  }

  return {
    prepare: (sql: string) => makeStmt(sql, []),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    batch: async (stmts: ReturnType<D1Database["prepare"]>[]) =>
      Promise.all(
        stmts.map((s) => (s as unknown as { run: () => Promise<unknown> }).run()),
      ),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
    _codes: codes,
  } as unknown as D1Database & { _codes: LoginCodeRow[] };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: makeMagicLinkD1({}),
    EVENTS: {} as Env["EVENTS"],
    BOOTSTRAP: {} as Env["BOOTSTRAP"],
    ADMIN_TOKEN: "token",
    SESSION_SECRET: "test-secret-32bytes-paddingXXXXX!",
    WEBHOOK_HOST_ALLOWLIST: "",
    VERSION: "test",
    ALERT_FROM_ADDRESS: "no-reply@example.com",
    EMAIL: { send: async () => {} },
    ...overrides,
  };
}

function makeCtx(): {
  waitUntil: (p: Promise<unknown>) => void;
  captured: Promise<unknown>[];
} {
  const captured: Promise<unknown>[] = [];
  return {
    waitUntil: (p) => captured.push(p),
    captured,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateLoginCode", () => {
  it("returns a 6-digit zero-padded string", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateLoginCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("produces values in [000000, 999999] across 10k samples", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const code = generateLoginCode();
      expect(code.length).toBe(6);
      const n = parseInt(code, 10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(999_999);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(100);
  });
});

describe("hashLoginCode", () => {
  it("is deterministic given same inputs", async () => {
    const env = makeEnv();
    const h1 = await hashLoginCode(env, "user@example.com", "123456");
    const h2 = await hashLoginCode(env, "user@example.com", "123456");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the code changes", async () => {
    const env = makeEnv();
    const h1 = await hashLoginCode(env, "user@example.com", "123456");
    const h2 = await hashLoginCode(env, "user@example.com", "123457");
    expect(h1).not.toBe(h2);
  });

  it("changes when the email changes", async () => {
    const env = makeEnv();
    const h1 = await hashLoginCode(env, "a@example.com", "000000");
    const h2 = await hashLoginCode(env, "b@example.com", "000000");
    expect(h1).not.toBe(h2);
  });

  it("is case-insensitive on email", async () => {
    const env = makeEnv();
    const h1 = await hashLoginCode(env, "User@Example.COM", "999999");
    const h2 = await hashLoginCode(env, "user@example.com", "999999");
    expect(h1).toBe(h2);
  });

  it("changes when the secret changes", async () => {
    const env1 = makeEnv({ SESSION_SECRET: "secret-one-XXXXXXXXXXXXXXXXXX!" });
    const env2 = makeEnv({ SESSION_SECRET: "secret-two-XXXXXXXXXXXXXXXXXX!" });
    const h1 = await hashLoginCode(env1, "user@example.com", "123456");
    const h2 = await hashLoginCode(env2, "user@example.com", "123456");
    expect(h1).not.toBe(h2);
  });
});

describe("issueLoginCode — allowlisted email", () => {
  it("inserts login_codes row, schedules EMAIL.send, returns codeSent:true", async () => {
    const sends: unknown[] = [];
    const db = makeMagicLinkD1({
      users: [{ email: "alice@example.com", disabled: 0 }],
    }) as D1Database & { _codes: LoginCodeRow[] };
    const env = makeEnv({
      DB: db,
      EMAIL: { send: async (msg) => { sends.push(msg); } },
    });
    const ctx = makeCtx();

    const result = await issueLoginCode(env, db, ctx, "alice@example.com");

    expect(result.codeSent).toBe(true);
    expect((db as unknown as { _codes: LoginCodeRow[] })._codes).toHaveLength(1);
    expect(ctx.captured).toHaveLength(1);
    await ctx.captured[0];
    expect(sends).toHaveLength(1);
    const msg = sends[0] as { from: string; to: string; subject: string; text: string };
    expect(msg.to).toBe("alice@example.com");
    expect(msg.subject).toContain("domain-drop-watcher sign-in code:");
    expect(msg.text).toContain("Your 6-digit code:");
    expect(msg.text).not.toMatch(/https?:\/\//);
  });
});

describe("issueLoginCode — non-allowlisted email", () => {
  it("returns codeSent:false, no login_codes row, no email send", async () => {
    const sends: unknown[] = [];
    const db = makeMagicLinkD1({ users: [] }) as D1Database & { _codes: LoginCodeRow[] };
    const env = makeEnv({
      DB: db,
      EMAIL: { send: async (msg) => { sends.push(msg); } },
    });
    const ctx = makeCtx();

    const result = await issueLoginCode(env, db, ctx, "unknown@example.com");

    expect(result.codeSent).toBe(false);
    expect((db as unknown as { _codes: LoginCodeRow[] })._codes).toHaveLength(0);
    expect(sends).toHaveLength(0);
  });
});

describe("issueLoginCode — disabled allowlisted email", () => {
  it("returns codeSent:false, no login_codes row, no email send", async () => {
    const sends: unknown[] = [];
    const db = makeMagicLinkD1({
      users: [{ email: "disabled@example.com", disabled: 1 }],
    }) as D1Database & { _codes: LoginCodeRow[] };
    const env = makeEnv({
      DB: db,
      EMAIL: { send: async (msg) => { sends.push(msg); } },
    });
    const ctx = makeCtx();

    const result = await issueLoginCode(env, db, ctx, "disabled@example.com");

    expect(result.codeSent).toBe(false);
    expect((db as unknown as { _codes: LoginCodeRow[] })._codes).toHaveLength(0);
    expect(sends).toHaveLength(0);
  });
});

describe("redeemLoginCode — happy path", () => {
  it("returns ok:true and sets used_at on the row", async () => {
    const env = makeEnv();
    const code = "042042";
    const hash = await hashLoginCode(env, "bob@example.com", code);
    const now = Math.floor(Date.now() / 1000);
    const db = makeMagicLinkD1({
      users: [{ email: "bob@example.com", disabled: 0 }],
      login_codes: [
        {
          code_hash: hash,
          email: "bob@example.com",
          created_at: now - 60,
          expires_at: now + 540,
          used_at: null,
          verify_attempts: 0,
        },
      ],
    }) as D1Database & { _codes: LoginCodeRow[] };

    const result = await redeemLoginCode(env, db, "bob@example.com", code);

    expect(result.ok).toBe(true);
    const row = (db as unknown as { _codes: LoginCodeRow[] })._codes[0]!;
    expect(row.used_at).not.toBeNull();
  });
});

describe("redeemLoginCode — wrong code (note: verify_attempts increment requires knowing which row to bump; wrong hash finds no row, so increment is a no-op — per-email rate limit handles bulk brute force)", () => {
  it("returns not_found for a code that does not match", async () => {
    const env = makeEnv();
    const correctCode = "777777";
    const hash = await hashLoginCode(env, "carol@example.com", correctCode);
    const now = Math.floor(Date.now() / 1000);
    const db = makeMagicLinkD1({
      users: [{ email: "carol@example.com", disabled: 0 }],
      login_codes: [
        {
          code_hash: hash,
          email: "carol@example.com",
          created_at: now - 60,
          expires_at: now + 540,
          used_at: null,
          verify_attempts: 0,
        },
      ],
    });

    const result = await redeemLoginCode(env, db, "carol@example.com", "000000");
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toBe("not_found");
  });
});

describe("redeemLoginCode — expired code", () => {
  it("returns expired for a code past its expires_at", async () => {
    const env = makeEnv();
    const code = "123456";
    const hash = await hashLoginCode(env, "dave@example.com", code);
    const now = Math.floor(Date.now() / 1000);
    const db = makeMagicLinkD1({
      users: [{ email: "dave@example.com", disabled: 0 }],
      login_codes: [
        {
          code_hash: hash,
          email: "dave@example.com",
          created_at: now - 700,
          expires_at: now - 100,
          used_at: null,
          verify_attempts: 0,
        },
      ],
    });

    const result = await redeemLoginCode(env, db, "dave@example.com", code);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toBe("expired");
  });
});

describe("redeemLoginCode — re-redemption", () => {
  it("first call returns ok:true, second call returns not_found (row excluded by used_at IS NULL)", async () => {
    const env = makeEnv();
    const code = "654321";
    const hash = await hashLoginCode(env, "eve@example.com", code);
    const now = Math.floor(Date.now() / 1000);
    const db = makeMagicLinkD1({
      users: [{ email: "eve@example.com", disabled: 0 }],
      login_codes: [
        {
          code_hash: hash,
          email: "eve@example.com",
          created_at: now - 60,
          expires_at: now + 540,
          used_at: null,
          verify_attempts: 0,
        },
      ],
    });

    const first = await redeemLoginCode(env, db, "eve@example.com", code);
    expect(first.ok).toBe(true);

    const second = await redeemLoginCode(env, db, "eve@example.com", code);
    expect(second.ok).toBe(false);
    expect((second as { ok: false; reason: string }).reason).toBe("not_found");
  });

  it("concurrent race returns used when UPDATE changes=0", async () => {
    const env = makeEnv();
    const code = "654321";
    const hash = await hashLoginCode(env, "eve2@example.com", code);
    const now = Math.floor(Date.now() / 1000);

    const dbRaw = makeMagicLinkD1({
      users: [{ email: "eve2@example.com", disabled: 0 }],
      login_codes: [
        {
          code_hash: hash,
          email: "eve2@example.com",
          created_at: now - 60,
          expires_at: now + 540,
          used_at: null,
          verify_attempts: 0,
        },
      ],
    }) as D1Database & { _codes: LoginCodeRow[] };

    const origPrepare = dbRaw.prepare.bind(dbRaw);
    let blockUpdateOnce = true;
    const db = {
      ...dbRaw,
      prepare: (sql: string) => {
        const stmt = origPrepare(sql);
        if (
          blockUpdateOnce &&
          sql.toLowerCase().includes("update login_codes") &&
          sql.toLowerCase().includes("used_at") &&
          sql.toLowerCase().includes("where code_hash")
        ) {
          blockUpdateOnce = false;
          return {
            ...stmt,
            bind: (...args: unknown[]) => ({
              ...stmt.bind(...args),
              run: async () => ({
                success: true,
                results: [],
                meta: {
                  changes: 0,
                  last_row_id: 0,
                  duration: 0,
                  rows_read: 0,
                  rows_written: 0,
                  size_after: 0,
                  changed_db: false,
                },
              }),
            }),
          } as unknown as ReturnType<D1Database["prepare"]>;
        }
        return stmt;
      },
    } as unknown as D1Database;

    const result = await redeemLoginCode(env, db, "eve2@example.com", code);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toBe("used");
  });
});

describe("issueLoginCode — DEMO_MODE gate (defense in depth)", () => {
  it("issueLoginCode rejects non-admin email in DEMO_MODE (defense in depth)", async () => {
    const sends: unknown[] = [];
    const db = makeMagicLinkD1({
      users: [
        { email: "admin@example.com", disabled: 0 },
        { email: "guest@example.com", disabled: 0 },
      ],
    }) as D1Database & { _codes: LoginCodeRow[] };
    const env = makeEnv({
      DB: db,
      EMAIL: { send: async (msg) => { sends.push(msg); } },
      DEMO_MODE: "1",
      DEMO_ADMIN_EMAIL: "admin@example.com",
    });
    const ctx = makeCtx();

    expect((await issueLoginCode(env, db, ctx, "guest@example.com")).codeSent).toBe(false);
    expect((await issueLoginCode(env, db, ctx, "admin@example.com")).codeSent).toBe(true);
  });
});

describe("redeemLoginCode — attempts_exhausted", () => {
  it("returns attempts_exhausted when verify_attempts >= 5", async () => {
    const env = makeEnv();
    const code = "111111";
    const hash = await hashLoginCode(env, "frank@example.com", code);
    const now = Math.floor(Date.now() / 1000);
    const db = makeMagicLinkD1({
      users: [{ email: "frank@example.com", disabled: 0 }],
      login_codes: [
        {
          code_hash: hash,
          email: "frank@example.com",
          created_at: now - 60,
          expires_at: now + 540,
          used_at: null,
          verify_attempts: 5,
        },
      ],
    });

    const result = await redeemLoginCode(env, db, "frank@example.com", code);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toBe("attempts_exhausted");
  });
});

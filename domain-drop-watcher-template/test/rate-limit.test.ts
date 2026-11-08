import { describe, it, expect } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  checkSendCodeRate,
  checkVerifyCodeRate,
  recordLoginAttempt,
  type LoginAttemptEvent,
} from "../src/auth/rate-limit.js";

// ---------------------------------------------------------------------------
// Minimal in-memory D1 mock for login_attempts table
// ---------------------------------------------------------------------------

interface AttemptRow {
  id: number;
  subject_type: string;
  subject_key: string;
  ts: number;
  event_type: string;
}

function makeRateLimitD1(opts: { attempts?: AttemptRow[] } = {}): D1Database & {
  _attempts: AttemptRow[];
} {
  const attempts: AttemptRow[] = opts.attempts ? [...opts.attempts] : [];
  let nextId = (opts.attempts?.length ?? 0) + 1;

  function executeSQL(
    sql: string,
    bindings: unknown[],
  ): { results: unknown[]; changes: number } {
    const lower = sql.toLowerCase().trim();

    if (lower.startsWith("insert") && lower.includes("into login_attempts")) {
      const row: AttemptRow = {
        id: nextId++,
        subject_type: bindings[0] as string,
        subject_key: bindings[1] as string,
        ts: bindings[2] as number,
        event_type: bindings[3] as string,
      };
      attempts.push(row);
      return { results: [], changes: 1 };
    }

    if (lower.startsWith("select") && lower.includes("from login_attempts")) {
      const subjTypeIdx = lower.indexOf("subject_type = '");
      let subjType: string | null = null;
      if (subjTypeIdx >= 0) {
        const after = lower.slice(subjTypeIdx + "subject_type = '".length);
        subjType = after.slice(0, after.indexOf("'"));
      }

      const subjKey = bindings[0] as string;
      const tsThreshold = bindings[1] as number;
      const eventFilter = bindings[2] as string | undefined;

      let rows = attempts.filter((r) => {
        if (r.subject_key !== subjKey) return false;
        if (subjType && r.subject_type !== subjType) return false;
        if (r.ts <= tsThreshold) return false;
        return true;
      });

      if (eventFilter !== undefined) {
        rows = rows.filter((r) => r.event_type === eventFilter);
      } else if (lower.includes("event_type in (")) {
        const start = lower.indexOf("event_type in (") + "event_type in (".length;
        const end = lower.indexOf(")", start);
        const values = lower
          .slice(start, end)
          .split(",")
          .map((v) => v.trim().replace(/'/g, ""));
        rows = rows.filter((r) => values.includes(r.event_type));
      }

      return { results: [{ n: rows.length }], changes: 0 };
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

  const db = {
    prepare: (sql: string) => makeStmt(sql, []),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    batch: async (stmts: ReturnType<D1Database["prepare"]>[]) =>
      Promise.all(
        stmts.map((s) =>
          (s as unknown as { run: () => Promise<unknown> }).run(),
        ),
      ),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
    _attempts: attempts,
  };

  return db as unknown as D1Database & { _attempts: AttemptRow[] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkSendCodeRate — under all caps: allowed", () => {
  it("returns allowed:true when no prior attempts exist", async () => {
    const db = makeRateLimitD1();
    const now = 1_000_000;
    const result = await checkSendCodeRate(db, "alice@example.com", "1.2.3.4", now);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSec).toBeUndefined();
  });
});

describe("checkSendCodeRate — per-email burst cap", () => {
  it("rejects 4th send when 3 code_sent events exist in last 900s", async () => {
    const now = 1_000_000;
    const db = makeRateLimitD1({
      attempts: [
        { id: 1, subject_type: "email", subject_key: "bob@example.com", ts: now - 100, event_type: "code_sent" },
        { id: 2, subject_type: "email", subject_key: "bob@example.com", ts: now - 200, event_type: "code_sent" },
        { id: 3, subject_type: "email", subject_key: "bob@example.com", ts: now - 300, event_type: "code_sent" },
      ],
    });

    const result = await checkSendCodeRate(db, "bob@example.com", "5.6.7.8", now);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBe(900);
  });

  it("does not count events outside the 900s window", async () => {
    const now = 1_000_000;
    const db = makeRateLimitD1({
      attempts: [
        { id: 1, subject_type: "email", subject_key: "carol@example.com", ts: now - 100, event_type: "code_sent" },
        { id: 2, subject_type: "email", subject_key: "carol@example.com", ts: now - 200, event_type: "code_sent" },
        { id: 3, subject_type: "email", subject_key: "carol@example.com", ts: now - 901, event_type: "code_sent" },
      ],
    });

    const result = await checkSendCodeRate(db, "carol@example.com", "5.6.7.8", now);
    expect(result.allowed).toBe(true);
  });
});

describe("checkSendCodeRate — per-email daily cap", () => {
  it("rejects 21st send when 20 code_sent events exist in last 86400s", async () => {
    const now = 2_000_000;
    const attempts: AttemptRow[] = [];
    for (let i = 0; i < 20; i++) {
      attempts.push({
        id: i + 1,
        subject_type: "email",
        subject_key: "daily@example.com",
        ts: now - i * 3600,
        event_type: "code_sent",
      });
    }
    const db = makeRateLimitD1({ attempts });

    const result = await checkSendCodeRate(db, "daily@example.com", "9.9.9.9", now);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBe(14_400);
  });
});

describe("checkSendCodeRate — per-IP hour cap", () => {
  it("rejects when 50 ip-scoped events exist in last 3600s for that IP", async () => {
    const now = 3_000_000;
    const attempts: AttemptRow[] = [];
    for (let i = 0; i < 50; i++) {
      attempts.push({
        id: i + 1,
        subject_type: "ip",
        subject_key: "10.0.0.1",
        ts: now - i * 60,
        event_type: "code_sent",
      });
    }
    const db = makeRateLimitD1({ attempts });

    const result = await checkSendCodeRate(db, "victim@example.com", "10.0.0.1", now);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBe(3_600);
  });
});

describe("checkVerifyCodeRate — per-email verify-failure cap", () => {
  it("rejects 6th verify when 5 code_verify_fail events exist in last 600s", async () => {
    const now = 4_000_000;
    const attempts: AttemptRow[] = [];
    for (let i = 0; i < 5; i++) {
      attempts.push({
        id: i + 1,
        subject_type: "email",
        subject_key: "eve@example.com",
        ts: now - i * 60,
        event_type: "code_verify_fail",
      });
    }
    const db = makeRateLimitD1({ attempts });

    const result = await checkVerifyCodeRate(db, "eve@example.com", now);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBe(600);
  });

  it("allows verify when fewer than 5 failures in window", async () => {
    const now = 4_000_000;
    const db = makeRateLimitD1({
      attempts: [
        { id: 1, subject_type: "email", subject_key: "frank@example.com", ts: now - 100, event_type: "code_verify_fail" },
        { id: 2, subject_type: "email", subject_key: "frank@example.com", ts: now - 200, event_type: "code_verify_fail" },
      ],
    });

    const result = await checkVerifyCodeRate(db, "frank@example.com", now);
    expect(result.allowed).toBe(true);
  });
});

describe("SELECT-before-INSERT: rejected check does not write to login_attempts", () => {
  it("row count is unchanged after a rejected checkSendCodeRate call", async () => {
    const now = 5_000_000;
    const existing: AttemptRow[] = [
      { id: 1, subject_type: "email", subject_key: "grace@example.com", ts: now - 100, event_type: "code_sent" },
      { id: 2, subject_type: "email", subject_key: "grace@example.com", ts: now - 200, event_type: "code_sent" },
      { id: 3, subject_type: "email", subject_key: "grace@example.com", ts: now - 300, event_type: "code_sent" },
    ];
    const db = makeRateLimitD1({ attempts: existing });

    const before = db._attempts.length;
    const result = await checkSendCodeRate(db, "grace@example.com", "1.1.1.1", now);
    expect(result.allowed).toBe(false);

    const after = db._attempts.length;
    expect(after).toBe(before);
  });
});

describe("recordLoginAttempt — inserts a row", () => {
  it("writes email-scoped and ip-scoped rows independently", async () => {
    const now = 6_000_000;
    const db = makeRateLimitD1();

    await recordLoginAttempt(db, "email", "henry@example.com", "code_sent", now);
    await recordLoginAttempt(db, "ip", "192.168.1.1", "code_sent", now);

    expect(db._attempts).toHaveLength(2);
    expect(db._attempts[0]!.subject_type).toBe("email");
    expect(db._attempts[0]!.subject_key).toBe("henry@example.com");
    expect(db._attempts[0]!.event_type).toBe("code_sent");
    expect(db._attempts[1]!.subject_type).toBe("ip");
    expect(db._attempts[1]!.subject_key).toBe("192.168.1.1");
  });
});

describe("checkSendCodeRate — email is lowercased", () => {
  it("matches existing rows regardless of input casing", async () => {
    const now = 7_000_000;
    const db = makeRateLimitD1({
      attempts: [
        { id: 1, subject_type: "email", subject_key: "ivan@example.com", ts: now - 100, event_type: "code_sent" },
        { id: 2, subject_type: "email", subject_key: "ivan@example.com", ts: now - 200, event_type: "code_sent" },
        { id: 3, subject_type: "email", subject_key: "ivan@example.com", ts: now - 300, event_type: "code_sent" },
      ],
    });

    const result = await checkSendCodeRate(db, "IVAN@EXAMPLE.COM", "2.2.2.2", now);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBe(900);
  });
});

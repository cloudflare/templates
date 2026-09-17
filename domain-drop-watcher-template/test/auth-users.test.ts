import { describe, it, expect, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  listUsers,
  getUser,
  getUserByUserId,
  addUser,
  removeUser,
  setUserDisabled,
  recordUserLogin,
  userCount,
  UserExistsError,
} from "../src/auth/users.js";

// ---------------------------------------------------------------------------
// In-memory D1 mock for users + sessions tables
// ---------------------------------------------------------------------------

interface RawUserRow {
  email: string;
  user_id: string;
  added_at: number;
  last_login_at: number | null;
  disabled: number;
  role: string;
}

interface SessionRow {
  session_id: string;
  email: string;
}

interface UsersD1 extends D1Database {
  _users: RawUserRow[];
  _sessions: SessionRow[];
}

function makeUsersD1(opts: {
  users?: RawUserRow[];
  sessions?: SessionRow[];
} = {}): UsersD1 {
  const users: RawUserRow[] = opts.users ? [...opts.users] : [];
  const sessions: SessionRow[] = opts.sessions ? [...opts.sessions] : [];

  function executeSQL(
    sql: string,
    bindings: unknown[],
  ): { results: unknown[]; changes: number } {
    const lower = sql.toLowerCase().trim();

    // SELECT COUNT(*) AS cnt FROM users
    if (lower.startsWith("select") && lower.includes("count(*)") && lower.includes("from users")) {
      return { results: [{ cnt: users.length }], changes: 0 };
    }

    // SELECT ... FROM users WHERE user_id = ?
    if (lower.startsWith("select") && lower.includes("from users") && lower.includes("user_id = ?")) {
      const userId = bindings[0] as string;
      const row = users.find((u) => u.user_id === userId) ?? null;
      return { results: row ? [row] : [], changes: 0 };
    }

    // SELECT ... FROM users WHERE email = ?
    if (lower.startsWith("select") && lower.includes("from users") && lower.includes("where email = ?")) {
      const email = bindings[0] as string;
      const row = users.find((u) => u.email === email) ?? null;
      return { results: row ? [row] : [], changes: 0 };
    }

    // SELECT ... FROM users ORDER BY added_at ASC
    if (lower.startsWith("select") && lower.includes("from users") && lower.includes("order by")) {
      return { results: [...users], changes: 0 };
    }

    // INSERT INTO users
    if (lower.startsWith("insert") && lower.includes("into users")) {
      const email = bindings[0] as string;
      const exists = users.some((u) => u.email === email);
      if (exists) {
        return { results: [], changes: 0 };
      }
      users.push({
        email,
        user_id: bindings[1] as string,
        added_at: bindings[2] as number,
        last_login_at: null,
        disabled: 0,
        role: bindings[3] as string,
      });
      return { results: [], changes: 1 };
    }

    // DELETE FROM users WHERE email = ?
    if (lower.startsWith("delete") && lower.includes("from users")) {
      const email = bindings[0] as string;
      const idx = users.findIndex((u) => u.email === email);
      if (idx >= 0) {
        users.splice(idx, 1);
        // Simulate ON DELETE CASCADE for sessions
        const toRemove: number[] = [];
        for (let i = sessions.length - 1; i >= 0; i--) {
          if (sessions[i]!.email === email) toRemove.push(i);
        }
        for (const i of toRemove) sessions.splice(i, 1);
        return { results: [], changes: 1 };
      }
      return { results: [], changes: 0 };
    }

    // UPDATE users SET disabled = ? WHERE email = ?
    if (lower.startsWith("update users") && lower.includes("disabled")) {
      const disabled = bindings[0] as number;
      const email = bindings[1] as string;
      const row = users.find((u) => u.email === email);
      if (row) {
        row.disabled = disabled;
        return { results: [], changes: 1 };
      }
      return { results: [], changes: 0 };
    }

    // UPDATE users SET last_login_at = ? WHERE email = ?
    if (lower.startsWith("update users") && lower.includes("last_login_at")) {
      const ts = bindings[0] as number;
      const email = bindings[1] as string;
      const row = users.find((u) => u.email === email);
      if (row) {
        row.last_login_at = ts;
        return { results: [], changes: 1 };
      }
      return { results: [], changes: 0 };
    }

    // SELECT COUNT(*) AS cnt FROM sessions WHERE email = ?
    if (lower.startsWith("select") && lower.includes("count(*)") && lower.includes("from sessions")) {
      const email = bindings[0] as string;
      const cnt = sessions.filter((s) => s.email === email).length;
      return { results: [{ cnt }], changes: 0 };
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
      Promise.all(stmts.map((s) => (s as unknown as { run: () => Promise<unknown> }).run())),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
    _users: users,
    _sessions: sessions,
  } as unknown as UsersD1;

  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("addUser — happy path", () => {
  it("inserts a row with lowercased email and UUID v4 user_id", async () => {
    const db = makeUsersD1();
    const now = Math.floor(Date.now() / 1000);

    const user = await addUser(db, "Alice@Example.COM", now);

    expect(user.email).toBe("alice@example.com");
    expect(user.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(user.addedAt).toBe(now);
    expect(user.lastLoginAt).toBeNull();
    expect(user.disabled).toBe(false);
    expect(user.role).toBe("admin");

    expect(db._users).toHaveLength(1);
    expect(db._users[0]!.email).toBe("alice@example.com");
  });
});

describe("addUser — duplicate (case-insensitive)", () => {
  it("throws UserExistsError when email already exists", async () => {
    const db = makeUsersD1();
    const now = Math.floor(Date.now() / 1000);

    await addUser(db, "bob@example.com", now);
    await expect(addUser(db, "BOB@EXAMPLE.COM", now)).rejects.toThrow(UserExistsError);
  });
});

describe("getUser — case-insensitive lookup", () => {
  it("finds a user regardless of input case", async () => {
    const db = makeUsersD1();
    const now = Math.floor(Date.now() / 1000);
    await addUser(db, "carol@example.com", now);

    const found = await getUser(db, "Carol@Example.COM");
    expect(found).not.toBeNull();
    expect(found!.email).toBe("carol@example.com");
  });

  it("returns null for an unknown email", async () => {
    const db = makeUsersD1();
    const result = await getUser(db, "nobody@example.com");
    expect(result).toBeNull();
  });
});

describe("getUserByUserId", () => {
  it("finds the row by stable userId", async () => {
    const db = makeUsersD1();
    const now = Math.floor(Date.now() / 1000);
    const user = await addUser(db, "dave@example.com", now);

    const found = await getUserByUserId(db, user.userId);
    expect(found).not.toBeNull();
    expect(found!.email).toBe("dave@example.com");
    expect(found!.userId).toBe(user.userId);
  });

  it("returns null for an unknown userId", async () => {
    const db = makeUsersD1();
    const result = await getUserByUserId(db, "00000000-0000-4000-8000-000000000000");
    expect(result).toBeNull();
  });
});

describe("setUserDisabled", () => {
  it("setUserDisabled(true) then getUser returns disabled:true", async () => {
    const db = makeUsersD1();
    const now = Math.floor(Date.now() / 1000);
    await addUser(db, "eve@example.com", now);

    const updated = await setUserDisabled(db, "eve@example.com", true);
    expect(updated).toBe(true);

    const user = await getUser(db, "eve@example.com");
    expect(user!.disabled).toBe(true);
  });

  it("setUserDisabled(false) re-enables a disabled user", async () => {
    const db = makeUsersD1();
    const now = Math.floor(Date.now() / 1000);
    await addUser(db, "frank@example.com", now);
    await setUserDisabled(db, "frank@example.com", true);
    await setUserDisabled(db, "frank@example.com", false);

    const user = await getUser(db, "frank@example.com");
    expect(user!.disabled).toBe(false);
  });

  it("returns false for a non-existent email", async () => {
    const db = makeUsersD1();
    const result = await setUserDisabled(db, "ghost@example.com", true);
    expect(result).toBe(false);
  });
});

describe("removeUser", () => {
  it("returns true on hit and false on miss", async () => {
    const db = makeUsersD1();
    const now = Math.floor(Date.now() / 1000);
    await addUser(db, "grace@example.com", now);

    const hit = await removeUser(db, "grace@example.com");
    expect(hit).toBe(true);
    expect(db._users).toHaveLength(0);

    const miss = await removeUser(db, "grace@example.com");
    expect(miss).toBe(false);
  });

  it("cascades to sessions rows for that email", async () => {
    const db = makeUsersD1({
      sessions: [
        { session_id: "sess-1", email: "henry@example.com" },
        { session_id: "sess-2", email: "henry@example.com" },
        { session_id: "sess-3", email: "other@example.com" },
      ],
    });
    const now = Math.floor(Date.now() / 1000);
    await addUser(db, "henry@example.com", now);

    expect(db._sessions.filter((s) => s.email === "henry@example.com")).toHaveLength(2);

    await removeUser(db, "henry@example.com");

    expect(db._sessions.filter((s) => s.email === "henry@example.com")).toHaveLength(0);
    expect(db._sessions.filter((s) => s.email === "other@example.com")).toHaveLength(1);
  });
});

describe("recordUserLogin", () => {
  it("updates last_login_at for the given email", async () => {
    const db = makeUsersD1();
    const now = Math.floor(Date.now() / 1000);
    await addUser(db, "iris@example.com", now);

    const loginTime = now + 3600;
    await recordUserLogin(db, "iris@example.com", loginTime);

    const user = await getUser(db, "iris@example.com");
    expect(user!.lastLoginAt).toBe(loginTime);
  });
});

describe("userCount", () => {
  it("returns 0 for an empty table", async () => {
    const db = makeUsersD1();
    expect(await userCount(db)).toBe(0);
  });

  it("reflects correct count after add/remove cycles", async () => {
    const db = makeUsersD1();
    const now = Math.floor(Date.now() / 1000);

    await addUser(db, "jack@example.com", now);
    await addUser(db, "kate@example.com", now);
    expect(await userCount(db)).toBe(2);

    await removeUser(db, "jack@example.com");
    expect(await userCount(db)).toBe(1);

    await addUser(db, "liam@example.com", now);
    expect(await userCount(db)).toBe(2);
  });
});

describe("listUsers", () => {
  it("returns all users as mapped UserRow objects", async () => {
    const db = makeUsersD1();
    const now = Math.floor(Date.now() / 1000);
    await addUser(db, "mike@example.com", now);
    await addUser(db, "nina@example.com", now + 1);

    const list = await listUsers(db);
    expect(list).toHaveLength(2);
    expect(list[0]!.email).toBe("mike@example.com");
    expect(list[1]!.email).toBe("nina@example.com");
    expect(typeof list[0]!.disabled).toBe("boolean");
  });
});

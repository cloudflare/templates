import { describe, it, expect } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import { runDemoReset } from "../src/worker.js";

interface Row {
  [key: string]: unknown;
}

type TableName = "domains" | "channels" | "domain_channels" | "users" | "config" | "auth_events";

function makeD1(seed?: { [table in TableName]?: Row[] }): D1Database {
  const tables: { [table in TableName]: Row[] } = {
    domains: seed?.domains ?? [],
    channels: seed?.channels ?? [],
    domain_channels: seed?.domain_channels ?? [],
    users: seed?.users ?? [],
    config: seed?.config ?? [],
    auth_events: seed?.auth_events ?? [],
  };

  let nextAuthEventId = 1;

  function matchTable(sql: string): TableName | null {
    const lower = sql.toLowerCase();
    if (lower.includes("domain_channels")) return "domain_channels";
    if (lower.includes("from domains") || lower.includes("into domains") || lower.includes("delete from domains")) return "domains";
    if (lower.includes("from channels") || lower.includes("into channels") || lower.includes("delete from channels")) return "channels";
    if (lower.includes("from users") || lower.includes("into users")) return "users";
    if (lower.includes("from auth_events") || lower.includes("into auth_events") || lower.includes("delete from auth_events")) return "auth_events";
    if (lower.includes("from config") || lower.includes("into config") || lower.includes("update config")) return "config";
    return null;
  }

  // Parse a VALUES(...) list into an array of values, mixing bindings in order of `?` placeholders.
  // Handles: string literals 'foo', numeric literals 123, and ? placeholders.
  function parseValues(valuesSql: string, bindings: unknown[]): unknown[] {
    const result: unknown[] = [];
    let bIdx = 0;
    // tokenize: match single-quoted strings, numbers, ?, or identifiers
    const tokenRe = /'([^']*)'|(\d+(?:\.\d+)?)|(\?)/g;
    let match;
    while ((match = tokenRe.exec(valuesSql)) !== null) {
      if (match[3] === "?") {
        result.push(bindings[bIdx++]);
      } else if (match[1] !== undefined) {
        result.push(match[1]); // string literal content
      } else if (match[2] !== undefined) {
        result.push(Number(match[2]));
      }
    }
    return result;
  }

  function executeSQL(sql: string, bindings: unknown[]): { results: Row[]; changes: number } {
    const lower = sql.toLowerCase().trim();
    const table = matchTable(sql);

    if (lower.startsWith("delete")) {
      if (!table) return { results: [], changes: 0 };
      let removed = 0;
      if (lower.includes("where")) {
        if (table === "auth_events" && lower.includes("event_type != 'demo_reset'")) {
          const before = tables[table].length;
          tables[table] = tables[table].filter((r) => r["event_type"] === "demo_reset");
          removed = before - tables[table].length;
        }
      } else {
        removed = tables[table].length;
        tables[table] = [];
      }
      return { results: [], changes: removed };
    }

    if (lower.startsWith("select")) {
      if (!table) return { results: [], changes: 0 };
      let rows = [...tables[table]];
      let bIdx = 0;

      if (lower.includes("where")) {
        if (/where\s+k\s*=\s*\?/.test(lower)) {
          const val = bindings[bIdx++] as string;
          rows = rows.filter((r) => r["k"] === val);
        }
      }

      if (lower.includes("order by ts desc")) {
        rows = [...rows].sort((a, b) => (b["ts"] as number) - (a["ts"] as number));
      }

      if (/select\s+count\(\*\)\s+as\s+c/.test(lower)) {
        return { results: [{ c: rows.length }], changes: 0 };
      }

      const literalLimitMatch = /limit\s+(\d+)/.exec(lower);
      if (literalLimitMatch) {
        const lim = parseInt(literalLimitMatch[1] ?? "0", 10);
        rows = rows.slice(0, lim);
      }

      return { results: rows, changes: 0 };
    }

    if (lower.startsWith("insert")) {
      if (!table) return { results: [], changes: 0 };

      // Extract column names
      const colMatch = /into\s+\w+\s*\(([^)]+)\)/.exec(lower);
      if (!colMatch) return { results: [], changes: 0 };
      const cols = colMatch[1]!.split(",").map((c) => c.trim());

      // Extract values list
      const valMatch = /values\s*\((.+)\)\s*$/.exec(lower);
      if (!valMatch) return { results: [], changes: 0 };
      const vals = parseValues(valMatch[1]!, bindings);

      const row: Row = {};
      cols.forEach((col, i) => { row[col] = vals[i]; });

      if (table === "auth_events") {
        row["id"] = nextAuthEventId++;
        tables.auth_events.push(row);
        return { results: [], changes: 1 };
      }

      if (table === "config") {
        const k = row["k"] as string;
        const v = row["v"] as string;
        const idx = tables.config.findIndex((r) => r["k"] === k);
        if (lower.includes("insert or replace") || lower.includes("on conflict")) {
          if (idx >= 0) {
            tables.config[idx] = { k, v };
          } else {
            tables.config.push({ k, v });
          }
        } else {
          tables.config.push({ k, v });
        }
        return { results: [], changes: 1 };
      }

      tables[table].push(row);
      return { results: [], changes: 1 };
    }

    return { results: [], changes: 0 };
  }

  function makeStmt(sql: string, bindings: unknown[]): ReturnType<D1Database["prepare"]> {
    const stmt = {
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
        return {
          success: true,
          results: res.results as T[],
          meta: { changes: res.changes, last_row_id: 0, duration: 0, rows_read: 0, rows_written: 0, size_after: 0, changed_db: false },
        };
      },
      raw: async <T = unknown>() => {
        const res = executeSQL(sql, bindings);
        return res.results.map((r) => Object.values(r)) as T[];
      },
    };
    return stmt as unknown as ReturnType<D1Database["prepare"]>;
  }

  return {
    prepare: (sql: string) => makeStmt(sql, []),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    batch: async (stmts: ReturnType<D1Database["prepare"]>[]) => {
      return Promise.all(stmts.map((s) => (s as unknown as { run: () => Promise<unknown> }).run()));
    },
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

describe("runDemoReset", () => {
  it("clears domains, channels, domain_channels; keeps users + config", async () => {
    const db = makeD1();
    await db.prepare("INSERT INTO users (email,user_id,added_at,disabled) VALUES (?,?,?,?)").bind("admin@example.com", "u1", 0, 0).run();
    await db.prepare("INSERT INTO domains (fqdn,added_at,cadence_minutes,phase_offset_minutes,next_due_at,paused,notify_on,tld_supported) VALUES (?,?,?,?,?,?,?,?)").bind("test.com", 0, 60, 0, 0, 0, '["available"]', 1).run();
    await db.prepare("INSERT INTO channels (id,type,target,label,disabled) VALUES (?,?,?,?,?)").bind("ch1", "webhook", "https://example.com/w", "w1", 0).run();
    await db.prepare("INSERT INTO config (k,v) VALUES (?,?)").bind("default_cadence_minutes", "60").run();
    await runDemoReset(db);
    const domains = await db.prepare("SELECT COUNT(*) as c FROM domains").first<{ c: number }>();
    const channels = await db.prepare("SELECT COUNT(*) as c FROM channels").first<{ c: number }>();
    const users = await db.prepare("SELECT COUNT(*) as c FROM users").first<{ c: number }>();
    const cadence = await db.prepare("SELECT v FROM config WHERE k=?").bind("default_cadence_minutes").first<{ v: string }>();
    expect(domains?.c).toBe(0);
    expect(channels?.c).toBe(0);
    expect(users?.c).toBe(1);
    expect(cadence?.v).toBe("60");
  });

  it("writes a demo_reset event to auth_events", async () => {
    const db = makeD1();
    await runDemoReset(db);
    const evt = await db.prepare("SELECT event_type FROM auth_events ORDER BY ts DESC LIMIT 1").first<{ event_type: string }>();
    expect(evt?.event_type).toBe("demo_reset");
  });

  it("updates config.last_demo_reset to current ts", async () => {
    const db = makeD1();
    await runDemoReset(db);
    const row = await db.prepare("SELECT v FROM config WHERE k=?").bind("last_demo_reset").first<{ v: string }>();
    expect(Number(row?.v)).toBeGreaterThan(0);
  });
});

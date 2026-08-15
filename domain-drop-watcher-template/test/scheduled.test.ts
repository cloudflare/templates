import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env, DomainRow } from "../src/types.js";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import worker from "../src/worker.js";

// ---------------------------------------------------------------------------
// In-memory D1 mock (subset needed for scheduled tests)
// ---------------------------------------------------------------------------

interface Row {
  [key: string]: unknown;
}

type TableName = "domains" | "channels" | "domain_channels" | "config";

function makeD1(seed?: { [table in TableName]?: Row[] }): D1Database & { _tables: Record<TableName, Row[]> } {
  const tables: { [table in TableName]: Row[] } = {
    domains: seed?.domains ?? [],
    channels: seed?.channels ?? [],
    domain_channels: seed?.domain_channels ?? [],
    config: seed?.config ?? [],
  };

  function matchTable(sql: string): TableName | null {
    const lower = sql.toLowerCase();
    if (lower.includes("from domains") || lower.includes("into domains") || lower.includes("update domains") || lower.includes("delete from domains")) return "domains";
    if (lower.includes("from channels") || lower.includes("into channels") || lower.includes("update channels") || lower.includes("delete from channels")) return "channels";
    if (lower.includes("from domain_channels") || lower.includes("into domain_channels") || lower.includes("delete from domain_channels")) return "domain_channels";
    if (lower.includes("from config") || lower.includes("into config") || lower.includes("update config")) return "config";
    return null;
  }

  function executeSQL(sql: string, bindings: unknown[]): { results: Row[]; changes: number } {
    const lower = sql.toLowerCase().trim();
    const table = matchTable(sql);

    if (lower.startsWith("select")) {
      if (!table) return { results: [], changes: 0 };
      let rows = [...tables[table]];
      let bIdx = 0;

      if (lower.includes("where")) {
        if (/where\s+k\s*=\s*\?/.test(lower)) {
          const val = bindings[bIdx++] as string;
          rows = rows.filter((r) => r["k"] === val);
        }
        if (/where\s+(?:dc\.)?fqdn\s*=\s*\?/.test(lower)) {
          const val = bindings[bIdx++] as string;
          rows = rows.filter((r) => r["fqdn"] === val);
        }
        if (lower.includes("next_due_at <=")) {
          const val = bindings[bIdx++] as number;
          rows = rows.filter((r) => (r["next_due_at"] as number) <= val);
        }
        if (lower.includes("paused = 0")) {
          rows = rows.filter((r) => r["paused"] === 0);
        }
        if (lower.includes("tld_supported = 1")) {
          rows = rows.filter((r) => r["tld_supported"] === 1);
        }
        if (lower.includes("join domain_channels dc")) {
          const dcRows = tables["domain_channels"];
          const fqdn = bindings[bIdx++] as string;
          rows = rows.filter((ch) =>
            dcRows.some((dc) => dc["channel_id"] === ch["id"] && dc["fqdn"] === fqdn),
          );
        }
      }

      // Handle both LIMIT <literal> and LIMIT ? (parameterized)
      const literalLimitMatch = /limit\s+(\d+)/.exec(lower);
      if (literalLimitMatch) {
        const lim = parseInt(literalLimitMatch[1] ?? "0", 10);
        rows = rows.slice(0, lim);
      } else if (/limit\s+\?/.test(lower)) {
        const lim = bindings[bIdx++] as number;
        rows = rows.slice(0, lim);
      }

      return { results: rows, changes: 0 };
    }

    if (lower.startsWith("insert")) {
      if (!table) return { results: [], changes: 0 };
      if (table === "config" && lower.includes("on conflict")) {
        const k = bindings[0] as string;
        const v = bindings[1] as string;
        const idx = tables.config.findIndex((r) => r["k"] === k);
        if (idx >= 0) {
          tables.config[idx] = { k, v };
        } else {
          tables.config.push({ k, v });
        }
        return { results: [], changes: 1 };
      }
      return { results: [], changes: 0 };
    }

    if (lower.startsWith("update")) {
      if (!table) return { results: [], changes: 0 };

      if (table === "domains") {
        if (lower.includes("last_checked_at") && lower.includes("next_due_at") && lower.includes("pending_confirm_status")) {
          const checkedAt = bindings[0] as number;
          const nextDueAt = bindings[1] as number;
          const newStatus = bindings[2] as string | null;
          const pendingConfirmStatus = bindings[3] as string | null;
          const pendingConfirmCount = bindings[4] as number;
          const fqdn = bindings[5] as string;
          tables.domains.forEach((r) => {
            if (r["fqdn"] !== fqdn) return;
            r["last_checked_at"] = checkedAt;
            r["next_due_at"] = nextDueAt;
            if (newStatus !== null) r["last_status"] = newStatus;
            r["pending_confirm_status"] = pendingConfirmStatus;
            r["pending_confirm_count"] = pendingConfirmCount;
          });
          return { results: [], changes: 1 };
        }
      }

      if (table === "channels") {
        if (lower.includes("last_delivery_result") && lower.includes("last_delivery_at")) {
          const result = bindings[0] as string;
          const at = bindings[1] as number;
          const id = bindings[2] as string;
          tables.channels.forEach((r) => {
            if (r["id"] === id) { r["last_delivery_result"] = result; r["last_delivery_at"] = at; }
          });
          return { results: [], changes: 1 };
        }
      }

      return { results: [], changes: 0 };
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
    _tables: tables,
  } as unknown as D1Database & { _tables: Record<TableName, Row[]> };
}

// ---------------------------------------------------------------------------
// KV mock
// ---------------------------------------------------------------------------

function makeKV(): KVNamespace & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    get: async (key: string, type?: string) => {
      const val = store.get(key) ?? null;
      if (type === "json" && val) return JSON.parse(val) as unknown;
      return val;
    },
    put: async (key: string, value: string, _opts?: unknown) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    list: async () => ({ keys: [], list_complete: true, cursor: undefined }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

// ---------------------------------------------------------------------------
// ExecutionContext mock
// ---------------------------------------------------------------------------

function makeCtx(): ExecutionContext {
  return {
    waitUntil(p: Promise<unknown>) { void p; },
    passThroughOnException() {},
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDomainRow(overrides: Partial<DomainRow> = {}): Row {
  return {
    fqdn: "example.com",
    added_at: 1000000,
    cadence_minutes: 60,
    phase_offset_minutes: 0,
    next_due_at: 1000000,
    paused: 0,
    last_status: null,
    last_status_changed_at: null,
    last_checked_at: null,
    pending_confirm_status: null,
    pending_confirm_count: 0,
    notify_on: JSON.stringify(["available", "dropping", "expiring"]),
    label: null,
    tld_supported: 1,
    ...overrides,
  };
}

function makeEnv(opts?: {
  dbSeed?: Parameters<typeof makeD1>[0];
  eventsKV?: KVNamespace & { _store: Map<string, string> };
}): Env & { DB: D1Database & { _tables: Record<string, Row[]> }; EVENTS: KVNamespace & { _store: Map<string, string> } } {
  const events = opts?.eventsKV ?? makeKV();
  return {
    DB: makeD1(opts?.dbSeed),
    EVENTS: events,
    BOOTSTRAP: makeKV(),
    ADMIN_TOKEN: "test-token",
    WEBHOOK_HOST_ALLOWLIST: "*.webhook.office.com,hooks.slack.com,discord.com",
    VERSION: "test",
  } as unknown as Env & { DB: D1Database & { _tables: Record<string, Row[]> }; EVENTS: KVNamespace & { _store: Map<string, string> } };
}

const NOOP_EVENT = {} as ScheduledEvent;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../src/rdap.js", () => ({
  lookupDomain: vi.fn(),
}));

vi.mock("../src/alerts.js", () => ({
  dispatchAlert: vi.fn().mockResolvedValue([]),
}));

import { lookupDomain } from "../src/rdap.js";
import { dispatchAlert } from "../src/alerts.js";

const mockLookup = lookupDomain as ReturnType<typeof vi.fn>;
const mockDispatch = dispatchAlert as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockDispatch.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("scheduled() — global pause", () => {
  it("returns immediately when global_paused=1, no RDAP calls", async () => {
    const env = makeEnv({
      dbSeed: {
        config: [{ k: "global_paused", v: "1" }],
        domains: [makeDomainRow({ next_due_at: 0 })],
      },
    });
    await worker.scheduled(NOOP_EVENT, env, makeCtx());
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

describe("scheduled() — no due domains", () => {
  it("skips RDAP when no domains are past next_due_at", async () => {
    const now = Math.floor(Date.now() / 1000);
    const env = makeEnv({
      dbSeed: {
        domains: [makeDomainRow({ next_due_at: now + 9999 })],
      },
    });
    await worker.scheduled(NOOP_EVENT, env, makeCtx());
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

describe("scheduled() — registered → registered (no alert)", () => {
  it("updates last_checked_at and next_due_at, fires no alert", async () => {
    const now = Math.floor(Date.now() / 1000);
    const env = makeEnv({
      dbSeed: {
        domains: [makeDomainRow({ fqdn: "test.com", last_status: "registered", next_due_at: now - 1 })],
      },
    });

    mockLookup.mockResolvedValueOnce({ status: "registered", source: "https://rdap.verisign.com/com/v1" });

    await worker.scheduled(NOOP_EVENT, env, makeCtx());

    expect(mockLookup).toHaveBeenCalledOnce();
    expect(mockDispatch).not.toHaveBeenCalled();

    const dom = env.DB._tables["domains"]![0]!;
    expect(dom["last_checked_at"]).toBe(now);
    expect((dom["next_due_at"] as number)).toBeGreaterThan(now);

    const ring = env.EVENTS._store.get("events:ring");
    if (ring) {
      const entries = JSON.parse(ring) as Array<{ kind: string }>;
      expect(entries.filter((e) => e.kind === "transition")).toHaveLength(0);
    }
  });
});

describe("scheduled() — confirmation gate (available)", () => {
  it("first observation: sets pending, no commit, no alert", async () => {
    const now = Math.floor(Date.now() / 1000);
    const env = makeEnv({
      dbSeed: {
        domains: [makeDomainRow({ fqdn: "drop.com", last_status: "registered", next_due_at: now - 1 })],
      },
    });

    mockLookup.mockResolvedValueOnce({ status: "available" });

    await worker.scheduled(NOOP_EVENT, env, makeCtx());

    expect(mockDispatch).not.toHaveBeenCalled();
    const dom = env.DB._tables["domains"]![0]!;
    expect(dom["pending_confirm_status"]).toBe("available");
    expect(dom["pending_confirm_count"]).toBe(1);
    expect(dom["last_status"]).toBe("registered");
  });

  it("second consecutive observation: commits status, fires alert", async () => {
    const now = Math.floor(Date.now() / 1000);
    const env = makeEnv({
      dbSeed: {
        domains: [
          makeDomainRow({
            fqdn: "drop.com",
            last_status: "registered",
            pending_confirm_status: "available",
            pending_confirm_count: 1,
            next_due_at: now - 1,
          }),
        ],
      },
    });

    mockLookup.mockResolvedValueOnce({ status: "available" });
    mockDispatch.mockResolvedValueOnce([{ channelId: "ch1", ok: true }]);

    await worker.scheduled(NOOP_EVENT, env, makeCtx());

    expect(mockDispatch).toHaveBeenCalledOnce();
    const dom = env.DB._tables["domains"]![0]!;
    expect(dom["last_status"]).toBe("available");
    expect(dom["pending_confirm_status"]).toBeNull();
    expect(dom["pending_confirm_count"]).toBe(0);
  });
});

describe("scheduled() — indeterminate during confirmation", () => {
  it("preserves pending_confirm_status and count on indeterminate; no alert", async () => {
    const now = Math.floor(Date.now() / 1000);
    const env = makeEnv({
      dbSeed: {
        domains: [
          makeDomainRow({
            fqdn: "flaky.com",
            last_status: "registered",
            pending_confirm_status: "available",
            pending_confirm_count: 1,
            next_due_at: now - 1,
          }),
        ],
      },
    });

    mockLookup.mockResolvedValueOnce({ status: "indeterminate", reason: "timeout" });

    await worker.scheduled(NOOP_EVENT, env, makeCtx());

    expect(mockDispatch).not.toHaveBeenCalled();

    const dom = env.DB._tables["domains"]![0]!;
    // Indeterminate pushes a minimal update (only checkedAt + nextDueAt) — pending fields unchanged
    expect(dom["last_status"]).toBe("registered");
    expect(dom["pending_confirm_status"]).toBe("available");
    expect(dom["pending_confirm_count"]).toBe(1);
  });
});

describe("scheduled() — alert dedupe", () => {
  it("fires alert once; subsequent run with same state suppressed by seen key", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sharedEvents = makeKV();

    // Run 1: confirm dropping, fire alert
    const env1 = makeEnv({
      dbSeed: {
        domains: [
          makeDomainRow({
            fqdn: "dedupe.com",
            last_status: "registered",
            pending_confirm_status: "dropping",
            pending_confirm_count: 1,
            next_due_at: now - 1,
          }),
        ],
      },
      eventsKV: sharedEvents,
    });

    mockLookup.mockResolvedValueOnce({ status: "dropping" });
    mockDispatch.mockResolvedValueOnce([{ channelId: "ch1", ok: true }]);

    await worker.scheduled(NOOP_EVENT, env1, makeCtx());
    expect(mockDispatch).toHaveBeenCalledTimes(1);

    // Run 2: same domain, same status, same shared KV — markAlertSeen key exists
    const env2 = makeEnv({
      dbSeed: {
        domains: [
          makeDomainRow({
            fqdn: "dedupe.com",
            last_status: "registered",
            pending_confirm_status: "dropping",
            pending_confirm_count: 1,
            next_due_at: now - 1,
          }),
        ],
      },
      eventsKV: sharedEvents,
    });

    mockLookup.mockResolvedValueOnce({ status: "dropping" });

    await worker.scheduled(NOOP_EVENT, env2, makeCtx());
    expect(mockDispatch).toHaveBeenCalledTimes(1); // no additional call
  });
});

describe("scheduled() — LIMIT 45 respected", () => {
  it("calls lookupDomain exactly 45 times when 100 domains are due", async () => {
    const now = Math.floor(Date.now() / 1000);
    const domains: Row[] = Array.from({ length: 100 }, (_, i) =>
      makeDomainRow({ fqdn: `d${i}.com`, next_due_at: now - 1 }),
    );

    const env = makeEnv({ dbSeed: { domains } });
    mockLookup.mockResolvedValue({ status: "registered" });

    await worker.scheduled(NOOP_EVENT, env, makeCtx());

    expect(mockLookup).toHaveBeenCalledTimes(45);
  });
});

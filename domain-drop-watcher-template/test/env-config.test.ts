import { describe, it, expect } from "vitest";
import { getAlertFromAddress, getWebhookHostAllowlist } from "../src/env-config.js";
import type { Env } from "../src/types.js";
import type { D1Database } from "@cloudflare/workers-types";

function makeDb(configRows: { k: string; v: string }[]): D1Database {
  const rows = [...configRows];
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          const lower = sql.toLowerCase();
          if (lower.includes("from config") && lower.includes("where k")) {
            const k = args[0] as string;
            return rows.find((r) => r.k === k) ?? null;
          }
          return null;
        },
        run: async () => ({ success: true, results: [], meta: { changes: 0, last_row_id: 0, duration: 0, rows_read: 0, rows_written: 0, size_after: 0, changed_db: false } }),
        all: async () => ({ success: true, results: [] }),
        raw: async () => [],
      }),
      first: async () => null,
      run: async () => ({ success: true, results: [], meta: { changes: 0, last_row_id: 0, duration: 0, rows_read: 0, rows_written: 0, size_after: 0, changed_db: false } }),
      all: async () => ({ success: true, results: [] }),
      raw: async () => [],
    }),
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function makeEnv(overrides: Partial<{ ALERT_FROM_ADDRESS: string; WEBHOOK_HOST_ALLOWLIST: string }> = {}): Env {
  return {
    DB: makeDb([]),
    EVENTS: {} as never,
    BOOTSTRAP: {} as never,
    SESSION_SECRET: "test-secret",
    ADMIN_TOKEN: "test-token",
    ...overrides,
  } as Env;
}

describe("getAlertFromAddress — precedence", () => {
  it("returns undefined when neither DB row nor env var is set", async () => {
    const db = makeDb([]);
    const env = makeEnv();
    expect(await getAlertFromAddress(env, db)).toBeUndefined();
  });

  it("returns env var when DB row is absent", async () => {
    const db = makeDb([]);
    const env = makeEnv({ ALERT_FROM_ADDRESS: "env@example.com" });
    expect(await getAlertFromAddress(env, db)).toBe("env@example.com");
  });

  it("returns DB value when set, even if env var also set (DB wins)", async () => {
    const db = makeDb([{ k: "app.alert_from_address", v: "db@example.com" }]);
    const env = makeEnv({ ALERT_FROM_ADDRESS: "env@example.com" });
    expect(await getAlertFromAddress(env, db)).toBe("db@example.com");
  });

  it("falls back to env var when DB row is empty string", async () => {
    const db = makeDb([{ k: "app.alert_from_address", v: "" }]);
    const env = makeEnv({ ALERT_FROM_ADDRESS: "fallback@example.com" });
    expect(await getAlertFromAddress(env, db)).toBe("fallback@example.com");
  });
});

describe("getWebhookHostAllowlist — precedence", () => {
  it("returns undefined when neither DB nor env var is set", async () => {
    const db = makeDb([]);
    const env = makeEnv();
    expect(await getWebhookHostAllowlist(env, db)).toBeUndefined();
  });

  it("returns env var when DB row is absent", async () => {
    const db = makeDb([]);
    const env = makeEnv({ WEBHOOK_HOST_ALLOWLIST: "hooks.slack.com" });
    expect(await getWebhookHostAllowlist(env, db)).toBe("hooks.slack.com");
  });

  it("returns DB value when set, even if env var also set (DB wins)", async () => {
    const db = makeDb([{ k: "app.webhook_host_allowlist", v: "custom.example.com" }]);
    const env = makeEnv({ WEBHOOK_HOST_ALLOWLIST: "hooks.slack.com" });
    expect(await getWebhookHostAllowlist(env, db)).toBe("custom.example.com");
  });

  it("falls back to env var when DB row is empty string", async () => {
    const db = makeDb([{ k: "app.webhook_host_allowlist", v: "" }]);
    const env = makeEnv({ WEBHOOK_HOST_ALLOWLIST: "fallback.example.com" });
    expect(await getWebhookHostAllowlist(env, db)).toBe("fallback.example.com");
  });
});

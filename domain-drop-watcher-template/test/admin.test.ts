import { describe, it, expect, beforeEach } from "vitest";
import { handleAdmin } from "../src/admin.js";
import type { Env } from "../src/types.js";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import { createSession } from "../src/auth/session.js";

// ---------------------------------------------------------------------------
// In-memory D1 mock — supports all tables including auth tables
// ---------------------------------------------------------------------------

interface Row {
  [key: string]: unknown;
}

type CoreTableName = "domains" | "channels" | "domain_channels" | "config" | "config_meta";
type AuthTableName = "users" | "sessions" | "login_codes" | "login_attempts" | "auth_events" | "auth_challenges" | "passkeys";
type TableName = CoreTableName | AuthTableName;

function makeD1(seed?: { [table in CoreTableName]?: Row[] }): D1Database {
  const tables: { [table in TableName]: Row[] } = {
    domains: seed?.domains ?? [],
    channels: seed?.channels ?? [],
    domain_channels: seed?.domain_channels ?? [],
    config: seed?.config ?? [],
    config_meta: seed?.config_meta ?? [],
    users: [],
    sessions: [],
    login_codes: [],
    login_attempts: [],
    auth_events: [],
    auth_challenges: [],
    passkeys: [],
  };

  function matchTable(sql: string): TableName | null {
    const lower = sql.toLowerCase();
    if (lower.includes("from domains") || lower.includes("into domains") || lower.includes("update domains") || lower.includes("delete from domains")) return "domains";
    if (lower.includes("from channels") || lower.includes("into channels") || lower.includes("update channels") || lower.includes("delete from channels")) return "channels";
    if (lower.includes("from domain_channels") || lower.includes("into domain_channels") || lower.includes("delete from domain_channels")) return "domain_channels";
    if (lower.includes("from config_meta") || lower.includes("into config_meta") || lower.includes("update config_meta") || lower.includes("delete from config_meta")) return "config_meta";
    if (lower.includes("from config") || lower.includes("into config") || lower.includes("update config")) return "config";
    if (lower.includes("from users") || lower.includes("into users") || lower.includes("update users") || lower.includes("delete from users")) return "users";
    if (lower.includes("from sessions") || lower.includes("into sessions") || lower.includes("update sessions") || lower.includes("delete from sessions")) return "sessions";
    if (lower.includes("from login_codes") || lower.includes("into login_codes") || lower.includes("update login_codes") || lower.includes("delete from login_codes")) return "login_codes";
    if (lower.includes("from login_attempts") || lower.includes("into login_attempts") || lower.includes("delete from login_attempts")) return "login_attempts";
    if (lower.includes("from auth_events") || lower.includes("into auth_events") || lower.includes("delete from auth_events")) return "auth_events";
    if (lower.includes("from auth_challenges") || lower.includes("into auth_challenges") || lower.includes("delete from auth_challenges")) return "auth_challenges";
    if (lower.includes("from passkeys") || lower.includes("into passkeys") || lower.includes("delete from passkeys")) return "passkeys";
    return null;
  }

  function executeSQL(sql: string, bindings: unknown[]): { results: Row[]; changes: number; last_row_id: number } {
    const lower = sql.toLowerCase().trim();
    const table = matchTable(sql);

    // SELECT queries
    if (lower.startsWith("select")) {
      if (!table) return { results: [], changes: 0, last_row_id: 0 };

      // JOIN sessions + users (verifySessionCookie)
      if (lower.includes("join users") && lower.includes("from sessions")) {
        const sessionId = bindings[0] as string;
        const now = bindings[1] as number;
        const session = tables.sessions.find(
          (s) => s["session_id"] === sessionId && (s["expires_at"] as number) > now,
        );
        if (!session) return { results: [], changes: 0, last_row_id: 0 };
        const user = tables.users.find((u) => u["email"] === session["email"]);
        if (!user) return { results: [], changes: 0, last_row_id: 0 };
        return {
          results: [{
            session_id: session["session_id"],
            email: session["email"],
            auth_method: session["auth_method"],
            expires_at: session["expires_at"],
            disabled: user["disabled"] ?? 0,
          }],
          changes: 0,
          last_row_id: 0,
        };
      }

      // COUNT(*) for users
      if (lower.includes("count(*)") && lower.includes("from users")) {
        return { results: [{ cnt: tables.users.length }], changes: 0, last_row_id: 0 };
      }

      // COUNT(*) for sessions WHERE email = ? AND expires_at > ?
      if (lower.includes("count(*)") && lower.includes("from sessions")) {
        const email = bindings[0] as string;
        const nowTs = bindings[1] as number;
        const cnt = tables.sessions.filter(
          (s) => s["email"] === email && (s["expires_at"] as number) > nowTs,
        ).length;
        return { results: [{ cnt }], changes: 0, last_row_id: 0 };
      }

      // SELECT from sessions WHERE email = ? AND expires_at > ? ORDER BY
      if (table === "sessions" && lower.includes("where email")) {
        const email = bindings[0] as string;
        const nowTs = bindings[1] as number;
        const rows = tables.sessions.filter(
          (s) => s["email"] === email && (s["expires_at"] as number) > nowTs,
        );
        return { results: rows, changes: 0, last_row_id: 0 };
      }

      // SELECT from users
      if (table === "users") {
        if (lower.includes("where email")) {
          const email = bindings[0] as string;
          const row = tables.users.find((u) => u["email"] === email) ?? null;
          return { results: row ? [row] : [], changes: 0, last_row_id: 0 };
        }
        // ORDER BY added_at
        return { results: [...tables.users], changes: 0, last_row_id: 0 };
      }

      // SELECT from login_codes
      if (table === "login_codes") {
        const hash = bindings[0] as string;
        const email = bindings[1] as string;
        const row = tables.login_codes.find(
          (c) => c["code_hash"] === hash && c["email"] === email && c["used_at"] === null,
        );
        return { results: row ? [row] : [], changes: 0, last_row_id: 0 };
      }

      // SELECT from login_attempts — COUNT for rate limiting.
      // subject_type may be literal in SQL or a binding; bindings are [subjectKey, windowTs].
      if (table === "login_attempts" && lower.includes("count(*)")) {
        const literalTypeMatch = /subject_type\s*=\s*'([^']+)'/.exec(lower);
        const subjectType = literalTypeMatch?.[1] ?? null;
        const subjectKey = bindings[0] as string;
        const windowTs = bindings[1] as number;
        let rows = tables.login_attempts.filter(
          (r) => (subjectType ? r["subject_type"] === subjectType : true)
              && r["subject_key"] === subjectKey
              && (r["ts"] as number) > windowTs,
        );
        if (lower.includes("event_type in")) {
          rows = rows.filter((r) => r["event_type"] === "code_sent" || r["event_type"] === "code_verify_fail");
        } else if (lower.includes("event_type = 'code_verify_fail'")) {
          rows = rows.filter((r) => r["event_type"] === "code_verify_fail");
        }
        return { results: [{ n: rows.length }], changes: 0, last_row_id: 0 };
      }

      let rows = [...tables[table]];

      // WHERE conditions
      if (lower.includes("where")) {
        const fqdnMatch = /where\s+(?:dc\.)?fqdn\s*=\s*\?/.exec(lower);
        if (fqdnMatch) {
          const val = bindings[0] as string;
          rows = rows.filter((r) => r["fqdn"] === val);
          bindings = bindings.slice(1);
        }
        const chIdMatch = /where\s+channel_id\s*=\s*\?/.exec(lower);
        if (chIdMatch) {
          const val = bindings[0] as string;
          rows = rows.filter((r) => r["channel_id"] === val);
          bindings = bindings.slice(1);
        }
        const idMatch = /where\s+(?:c\.)?id\s*=\s*\?/.exec(lower);
        if (idMatch) {
          const val = bindings[0] as string;
          rows = rows.filter((r) => r["id"] === val);
          bindings = bindings.slice(1);
        }
        const kMatch = /where\s+k\s*=\s*\?/.exec(lower);
        if (kMatch) {
          const val = bindings[0] as string;
          rows = rows.filter((r) => r["k"] === val);
          bindings = bindings.slice(1);
        }
        if (lower.includes("paused = 0")) {
          rows = rows.filter((r) => r["paused"] === 0);
        }
        if (lower.includes("tld_supported = 1")) {
          rows = rows.filter((r) => r["tld_supported"] === 1);
        }
        if (lower.includes("next_due_at <=")) {
          const val = bindings[0] as number;
          rows = rows.filter((r) => (r["next_due_at"] as number) <= val);
          bindings = bindings.slice(1);
        }
        if (lower.includes("join domain_channels dc")) {
          const dcRows = tables["domain_channels"];
          rows = rows.filter((ch) => dcRows.some((dc) => dc["channel_id"] === ch["id"] && dc["fqdn"] === bindings[0]));
        }
      }

      const limitMatch = /limit\s+(\d+)/.exec(lower);
      if (limitMatch) {
        const lim = parseInt(limitMatch[1] ?? "0", 10);
        rows = rows.slice(0, lim);
      }

      return { results: rows, changes: 0, last_row_id: 0 };
    }

    // INSERT
    if (lower.startsWith("insert")) {
      if (!table) return { results: [], changes: 0, last_row_id: 0 };

      if (table === "config" && lower.includes("on conflict")) {
        const k = bindings[0] as string;
        const v = bindings[1] as string;
        const idx = tables.config.findIndex((r) => r["k"] === k);
        if (idx >= 0) {
          tables.config[idx] = { k, v };
        } else {
          tables.config.push({ k, v });
        }
        return { results: [], changes: 1, last_row_id: 0 };
      }

      if (table === "config_meta" && lower.includes("on conflict")) {
        const k = bindings[0] as string;
        const updated_at = bindings[1] as number;
        const updated_by = bindings[2] as string | null;
        const idx = tables.config_meta.findIndex((r) => r["k"] === k);
        if (idx >= 0) {
          tables.config_meta[idx] = { k, updated_at, updated_by: updated_by ?? null };
        } else {
          tables.config_meta.push({ k, updated_at, updated_by: updated_by ?? null });
        }
        return { results: [], changes: 1, last_row_id: 0 };
      }

      if (table === "domain_channels") {
        const fqdn = bindings[0] as string;
        const channel_id = bindings[1] as string;
        const exists = tables.domain_channels.some((r) => r["fqdn"] === fqdn && r["channel_id"] === channel_id);
        if (!exists) {
          tables.domain_channels.push({ fqdn, channel_id });
          return { results: [], changes: 1, last_row_id: 0 };
        }
        return { results: [], changes: 0, last_row_id: 0 };
      }

      if (table === "channels") {
        const row: Row = {
          id: bindings[0],
          type: bindings[1],
          target: bindings[2],
          label: bindings[3] ?? null,
          disabled: bindings[4] ?? 0,
          last_delivery_result: null,
          last_delivery_at: null,
        };
        tables.channels.push(row);
        return { results: [], changes: 1, last_row_id: 0 };
      }

      if (table === "domains" && lower.includes("with minutes")) {
        const fqdn = bindings[0] as string;
        const cadence_minutes = bindings[1] as number;
        const phase_offset_minutes = bindings[2] as number;
        const next_due_at = bindings[3] as number;
        const paused = bindings[4] as number;
        const notify_on = bindings[5] as string;
        const label = bindings[6] as string | null;
        const tld_supported = bindings[7] as number;
        const subreqLimit = bindings[11] as number;

        const active = tables.domains
          .filter((d) => d["paused"] === 0)
          .map((d) => ({ cadence: d["cadence_minutes"] as number, offset: d["phase_offset_minutes"] as number }));
        active.push({ cadence: cadence_minutes, offset: phase_offset_minutes });

        let peak = 0;
        for (let m = 0; m < 1440; m++) {
          let cnt = 0;
          for (const d of active) {
            if (m % d.cadence === d.offset) cnt++;
          }
          if (cnt > peak) peak = cnt;
        }

        if (peak > subreqLimit) {
          return { results: [], changes: 0, last_row_id: 0 };
        }

        const existing = tables.domains.findIndex((d) => d["fqdn"] === fqdn);
        const row: Row = {
          fqdn, added_at: Math.floor(Date.now() / 1000), cadence_minutes, phase_offset_minutes,
          next_due_at, paused, notify_on, label, tld_supported,
          last_status: null, last_status_changed_at: null, last_checked_at: null,
          pending_confirm_status: null, pending_confirm_count: 0,
        };
        if (existing >= 0) {
          tables.domains[existing] = row;
        } else {
          tables.domains.push(row);
        }
        return { results: [], changes: 1, last_row_id: 0 };
      }

      // INSERT INTO users
      if (table === "users") {
        const email = bindings[0] as string;
        const exists = tables.users.some((u) => u["email"] === email);
        if (exists) {
          return { results: [], changes: 0, last_row_id: 0 };
        }
        tables.users.push({
          email,
          user_id: bindings[1] as string,
          added_at: bindings[2] as number,
          last_login_at: null,
          disabled: 0,
          role: bindings[3] as string ?? "admin",
        });
        return { results: [], changes: 1, last_row_id: 0 };
      }

      // INSERT INTO sessions
      if (table === "sessions") {
        tables.sessions.push({
          session_id: bindings[0] as string,
          email: bindings[1] as string,
          created_at: bindings[2] as number,
          expires_at: bindings[3] as number,
          user_agent: bindings[4] as string | null,
          ip_address: bindings[5] as string | null,
          auth_method: bindings[6] as string,
        });
        return { results: [], changes: 1, last_row_id: 0 };
      }

      // INSERT INTO login_codes
      if (table === "login_codes") {
        tables.login_codes.push({
          code_hash: bindings[0] as string,
          email: bindings[1] as string,
          created_at: bindings[2] as number,
          expires_at: bindings[3] as number,
          used_at: null,
          verify_attempts: 0,
        });
        return { results: [], changes: 1, last_row_id: 0 };
      }

      // INSERT INTO login_attempts
      if (table === "login_attempts") {
        tables.login_attempts.push({
          subject_type: bindings[0] as string,
          subject_key: bindings[1] as string,
          ts: bindings[2] as number,
          event_type: bindings[3] as string,
        });
        return { results: [], changes: 1, last_row_id: 0 };
      }

      // INSERT INTO auth_events
      if (table === "auth_events") {
        tables.auth_events.push({
          ts: bindings[0] as number,
          email: bindings[1] as string | null,
          event_type: bindings[2] as string,
          auth_method: bindings[3] as string | null,
          ip_address: bindings[4] as string | null,
          user_agent: bindings[5] as string | null,
          metadata: bindings[6] as string | null,
        });
        return { results: [], changes: 1, last_row_id: 0 };
      }

      return { results: [], changes: 0, last_row_id: 0 };
    }

    // UPDATE
    if (lower.startsWith("update")) {
      if (!table) return { results: [], changes: 0, last_row_id: 0 };

      if (table === "users") {
        // UPDATE users SET disabled = ? WHERE email = ?
        if (lower.includes("disabled")) {
          const disabled = bindings[0] as number;
          const email = bindings[1] as string;
          let changed = 0;
          tables.users.forEach((u) => {
            if (u["email"] === email) { u["disabled"] = disabled; changed++; }
          });
          return { results: [], changes: changed, last_row_id: 0 };
        }
        // UPDATE users SET last_login_at = ? WHERE email = ?
        if (lower.includes("last_login_at")) {
          const ts = bindings[0] as number;
          const email = bindings[1] as string;
          tables.users.forEach((u) => { if (u["email"] === email) u["last_login_at"] = ts; });
          return { results: [], changes: 1, last_row_id: 0 };
        }
        return { results: [], changes: 0, last_row_id: 0 };
      }

      if (table === "login_codes") {
        // UPDATE login_codes SET verify_attempts = verify_attempts + 1 WHERE code_hash = ?
        if (lower.includes("verify_attempts") && !lower.includes("used_at")) {
          const hash = bindings[0] as string;
          let changed = 0;
          tables.login_codes.forEach((c) => {
            if (c["code_hash"] === hash) { (c["verify_attempts"] as number); c["verify_attempts"] = (c["verify_attempts"] as number) + 1; changed++; }
          });
          return { results: [], changes: changed, last_row_id: 0 };
        }
        // UPDATE login_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL
        if (lower.includes("used_at")) {
          const usedAt = bindings[0] as number;
          const hash = bindings[1] as string;
          let changed = 0;
          tables.login_codes.forEach((c) => {
            if (c["code_hash"] === hash && c["used_at"] === null) { c["used_at"] = usedAt; changed++; }
          });
          return { results: [], changes: changed, last_row_id: 0 };
        }
        return { results: [], changes: 0, last_row_id: 0 };
      }

      if (table === "domains") {
        if (lower.includes("last_checked_at")) {
          const val = bindings[0] as number;
          const fqdn = bindings[1] as string;
          tables.domains.forEach((r) => { if (r["fqdn"] === fqdn) r["last_checked_at"] = val; });
          return { results: [], changes: 1, last_row_id: 0 };
        }
        if (lower.includes("phase_offset_minutes")) {
          const cadence = bindings[0] as number;
          const offset = bindings[1] as number;
          const fqdn = bindings[2] as string;
          tables.domains.forEach((r) => {
            if (r["fqdn"] === fqdn) { r["cadence_minutes"] = cadence; r["phase_offset_minutes"] = offset; }
          });
          return { results: [], changes: 1, last_row_id: 0 };
        }
        const fqdn = bindings[bindings.length - 1] as string;
        const setMatch = /set\s+(.+?)\s+where/.exec(lower);
        if (setMatch) {
          const setParts = setMatch[1]!.split(",").map((s) => s.trim().split(/\s*=\s*/)[0]?.trim());
          tables.domains.forEach((r) => {
            if (r["fqdn"] !== fqdn) return;
            setParts.forEach((col, i) => { if (col) r[col] = bindings[i] ?? null; });
          });
        }
        return { results: [], changes: 1, last_row_id: 0 };
      }

      if (table === "channels") {
        const id = bindings[bindings.length - 1] as string;
        const setMatch = /set\s+(.+?)\s+where/.exec(lower);
        if (setMatch) {
          const setParts = setMatch[1]!.split(",").map((s) => s.trim().split(/\s*=\s*/)[0]?.trim());
          tables.channels.forEach((r) => {
            if (r["id"] !== id) return;
            setParts.forEach((col, i) => { if (col) r[col] = bindings[i] ?? null; });
          });
        }
        return { results: [], changes: 1, last_row_id: 0 };
      }

      return { results: [], changes: 0, last_row_id: 0 };
    }

    // DELETE
    if (lower.startsWith("delete")) {
      if (!table) return { results: [], changes: 0, last_row_id: 0 };

      if (table === "sessions") {
        // DELETE FROM sessions WHERE session_id = ?
        if (lower.includes("session_id")) {
          const id = bindings[0] as string;
          const before = tables.sessions.length;
          tables.sessions = tables.sessions.filter((s) => s["session_id"] !== id);
          return { results: [], changes: before - tables.sessions.length, last_row_id: 0 };
        }
        // DELETE FROM sessions WHERE email = ?
        if (lower.includes("email")) {
          const email = bindings[0] as string;
          const before = tables.sessions.length;
          tables.sessions = tables.sessions.filter((s) => s["email"] !== email);
          return { results: [], changes: before - tables.sessions.length, last_row_id: 0 };
        }
        return { results: [], changes: 0, last_row_id: 0 };
      }

      if (table === "users") {
        const email = bindings[0] as string;
        const before = tables.users.length;
        tables.users = tables.users.filter((u) => u["email"] !== email);
        tables.sessions = tables.sessions.filter((s) => s["email"] !== email);
        tables.login_codes = tables.login_codes.filter((c) => c["email"] !== email);
        tables.passkeys = tables.passkeys.filter((p) => p["email"] !== email);
        return { results: [], changes: before - tables.users.length, last_row_id: 0 };
      }

      if (table === "domains") {
        const fqdn = bindings[0] as string;
        const before = tables.domains.length;
        tables.domains = tables.domains.filter((r) => r["fqdn"] !== fqdn);
        const removed = before - tables.domains.length;
        if (removed > 0) {
          tables.domain_channels = tables.domain_channels.filter((r) => r["fqdn"] !== fqdn);
        }
        return { results: [], changes: removed, last_row_id: 0 };
      }

      if (table === "channels") {
        const id = bindings[0] as string;
        const before = tables.channels.length;
        tables.channels = tables.channels.filter((r) => r["id"] !== id);
        return { results: [], changes: before - tables.channels.length, last_row_id: 0 };
      }

      if (table === "domain_channels") {
        if (lower.includes("fqdn = ? and channel_id = ?")) {
          const fqdn = bindings[0] as string;
          const chId = bindings[1] as string;
          const before = tables.domain_channels.length;
          tables.domain_channels = tables.domain_channels.filter(
            (r) => !(r["fqdn"] === fqdn && r["channel_id"] === chId),
          );
          return { results: [], changes: before - tables.domain_channels.length, last_row_id: 0 };
        }
        const chId = bindings[0] as string;
        const before = tables.domain_channels.length;
        tables.domain_channels = tables.domain_channels.filter((r) => r["channel_id"] !== chId);
        return { results: [], changes: before - tables.domain_channels.length, last_row_id: 0 };
      }

      if (table === "config") {
        const k = bindings[0] as string;
        const before = tables.config.length;
        tables.config = tables.config.filter((r) => r["k"] !== k);
        tables.config_meta = tables.config_meta.filter((r) => r["k"] !== k);
        return { results: [], changes: before - tables.config.length, last_row_id: 0 };
      }

      if (table === "config_meta") {
        const k = bindings[0] as string;
        const before = tables.config_meta.length;
        tables.config_meta = tables.config_meta.filter((r) => r["k"] !== k);
        return { results: [], changes: before - tables.config_meta.length, last_row_id: 0 };
      }

      if (table === "login_attempts" || table === "login_codes" || table === "auth_events" || table === "auth_challenges") {
        // Cron cleanup — just clear all for test purposes
        tables[table] = [];
        return { results: [], changes: 1, last_row_id: 0 };
      }

      return { results: [], changes: 0, last_row_id: 0 };
    }

    return { results: [], changes: 0, last_row_id: 0 };
  }

  function makeStmt(sql: string, bindings: unknown[]): ReturnType<D1Database["prepare"]> {
    const stmt = {
      bind: (...args: unknown[]) => makeStmt(sql, args),
      run: async () => {
        const res = executeSQL(sql, bindings);
        return {
          success: res.changes >= 0,
          results: res.results,
          meta: { changes: res.changes, last_row_id: res.last_row_id, duration: 0, rows_read: 0, rows_written: 0, size_after: 0, changed_db: false },
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
          meta: { changes: res.changes, last_row_id: res.last_row_id, duration: 0, rows_read: 0, rows_written: 0, size_after: 0, changed_db: false },
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
  } as unknown as D1Database;
}

// ---------------------------------------------------------------------------
// KV mock
// ---------------------------------------------------------------------------

function makeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: string) => {
      const val = store.get(key) ?? null;
      if (type === "json" && val) return JSON.parse(val) as unknown;
      return val;
    },
    put: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    list: async () => ({ keys: [], list_complete: true, cursor: undefined }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

// ---------------------------------------------------------------------------
// Env factory
// ---------------------------------------------------------------------------

const SENDS: unknown[] = [];

function makeEnv(
  dbSeed?: { [table in "domains" | "channels" | "domain_channels" | "config"]?: Row[] },
  assets?: { fetch: (req: Request) => Promise<Response> },
): Env {
  return {
    DB: makeD1(dbSeed),
    EVENTS: makeKV(),
    BOOTSTRAP: makeKV(),
    ADMIN_TOKEN: "correct-token",
    SESSION_SECRET: "test-session-secret-placeholder-for-unit-tests",
    WEBHOOK_HOST_ALLOWLIST: "*.webhook.office.com,hooks.slack.com,discord.com,discordapp.com",
    VERSION: "0.1.0-test",
    ALERT_FROM_ADDRESS: "no-reply@example.com",
    EMAIL: { send: async (msg: unknown) => { SENDS.push(msg); } },
    ASSETS: assets,
  };
}

function authReq(path: string, opts?: RequestInit): Request {
  return new Request(`https://example.workers.dev${path}`, {
    ...opts,
    headers: { "Authorization": "Bearer correct-token", "content-type": "application/json", ...(opts?.headers ?? {}) },
  });
}

function noAuthReq(path: string, opts?: RequestInit): Request {
  return new Request(`https://example.workers.dev${path}`, opts);
}

const NOOP_CTX: ExecutionContext = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

// Helper: seed a user and mint a valid session cookie
async function mintSessionCookie(env: Env, email: string): Promise<string> {
  const db = env.DB;
  const now = Math.floor(Date.now() / 1000);
  // seed user
  await db.prepare(
    "INSERT INTO users (email, user_id, added_at, last_login_at, disabled, role) VALUES (?, ?, ?, NULL, 0, ?)",
  ).bind(email, crypto.randomUUID(), now, "admin").run();
  // create session
  const session = await createSession(env, db, { email, authMethod: "email-code" });
  return session.cookieValue;
}

function sessionReq(path: string, cookieValue: string, opts?: RequestInit): Request {
  return new Request(`https://example.workers.dev${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      "cookie": `dropwatch_session=${cookieValue}`,
      "origin": "https://example.workers.dev",
      ...(opts?.headers ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Tests — existing resolveAdminToken / auth middleware
// ---------------------------------------------------------------------------

describe("resolveAdminToken — null cases", () => {
  it("returns 401 when ADMIN_TOKEN is undefined", async () => {
    const env = makeEnv();
    env.ADMIN_TOKEN = undefined;
    const res = await handleAdmin(
      new Request("https://example.workers.dev/domains", { headers: { Authorization: "Bearer anything" } }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when ADMIN_TOKEN is empty string", async () => {
    const env = makeEnv();
    env.ADMIN_TOKEN = "";
    const res = await handleAdmin(
      new Request("https://example.workers.dev/domains", { headers: { Authorization: "Bearer anything" } }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when ADMIN_TOKEN is only whitespace", async () => {
    const env = makeEnv();
    env.ADMIN_TOKEN = "   ";
    const res = await handleAdmin(
      new Request("https://example.workers.dev/domains", { headers: { Authorization: "Bearer    " } }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(401);
  });
});

describe("/health — unauthenticated", () => {
  it("returns 200 + {ok:true} without auth", async () => {
    const env = makeEnv();
    const res = await handleAdmin(noAuthReq("/health"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
  });
});

describe("auth middleware — bearer path", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const env = makeEnv();
    const res = await handleAdmin(noAuthReq("/domains"), env, NOOP_CTX);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 when token is wrong", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      new Request("https://example.workers.dev/domains", { headers: { "Authorization": "Bearer wrong-token" } }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for wrong token on non-domain route", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      new Request("https://example.workers.dev/budget", { headers: { "Authorization": "Bearer bad" } }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(401);
  });
});

describe("auth middleware — session cookie path", () => {
  it("allows access via valid session cookie", async () => {
    const env = makeEnv();
    const cookieValue = await mintSessionCookie(env, "user@example.com");
    const res = await handleAdmin(
      sessionReq("/domains", cookieValue),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 for tampered session cookie", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      sessionReq("/domains", "bad-session-value.tampered"),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for expired session cookie", async () => {
    const env = makeEnv();
    // Insert an expired session directly
    const db = env.DB;
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(
      "INSERT INTO users (email, user_id, added_at, last_login_at, disabled, role) VALUES (?, ?, ?, NULL, 0, 'admin')",
    ).bind("expired@example.com", crypto.randomUUID(), now).run();
    // Create session then manually expire it — use a real cookie then modify the table
    const session = await createSession(env, db, { email: "expired@example.com", authMethod: "email-code" });
    // Expire it by patching the table directly via raw insert replacement
    const tables = (db as unknown as { _tables: { sessions: Row[] } })._tables;
    if (tables) {
      const s = tables.sessions.find((r) => r["session_id"] === session.sessionId);
      if (s) s["expires_at"] = now - 1;
    }
    const res = await handleAdmin(sessionReq("/domains", session.cookieValue), env, NOOP_CTX);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /domains, POST /domains, etc — existing tests (bearer path still works)
// ---------------------------------------------------------------------------

describe("GET /domains", () => {
  it("returns 200 + empty array initially", async () => {
    const env = makeEnv();
    const res = await handleAdmin(authReq("/domains"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it("returns domain list when seeded", async () => {
    const env = makeEnv({
      domains: [{
        fqdn: "example.com", added_at: 1, cadence_minutes: 5, phase_offset_minutes: 0,
        next_due_at: 2, paused: 0, notify_on: '["available"]', label: null, tld_supported: 1,
        last_status: null, last_status_changed_at: null, last_checked_at: null,
        pending_confirm_status: null, pending_confirm_count: 0,
      }],
    });
    const res = await handleAdmin(authReq("/domains"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ fqdn: string }>;
    expect(body.length).toBe(1);
    expect(body[0]?.fqdn).toBe("example.com");
  });
});

describe("POST /domains — valid", () => {
  it("returns 201 + domain with phase_offset_minutes populated", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/domains", { method: "POST", body: JSON.stringify({ fqdn: "test-drop.com", cadenceMinutes: 5, notifyOn: ["available"] }) }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { fqdn: string; phase_offset_minutes: number };
    expect(body.fqdn).toBe("test-drop.com");
    expect(typeof body.phase_offset_minutes).toBe("number");
  });

  it("lowercases fqdn before storing", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/domains", { method: "POST", body: JSON.stringify({ fqdn: "UPPER.COM" }) }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { fqdn: string };
    expect(body.fqdn).toBe("upper.com");
  });
});

describe("POST /domains — validation", () => {
  it("returns 400 for missing fqdn", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/domains", { method: "POST", body: JSON.stringify({ cadenceMinutes: 5 }) }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("validation_failed");
  });

  it("returns 400 for invalid fqdn format", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/domains", { method: "POST", body: JSON.stringify({ fqdn: "not a domain!" }) }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for cadenceMinutes out of range", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/domains", { method: "POST", body: JSON.stringify({ fqdn: "test.com", cadenceMinutes: 9999 }) }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /domains — over budget", () => {
  it("returns 400 with error:'budget_exceeded' when 45 1-min domains already exist", async () => {
    const existingDomains = Array.from({ length: 45 }, (_, i) => ({
      fqdn: `domain-${i}.com`,
      added_at: 1, cadence_minutes: 1, phase_offset_minutes: 0, next_due_at: 1, paused: 0,
      notify_on: '["available"]', label: null, tld_supported: 1,
      last_status: null, last_status_changed_at: null, last_checked_at: null,
      pending_confirm_status: null, pending_confirm_count: 0,
    }));
    const env = makeEnv({ domains: existingDomains });
    const res = await handleAdmin(
      authReq("/domains", { method: "POST", body: JSON.stringify({ fqdn: "newdomain.com", cadenceMinutes: 1 }) }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("budget_exceeded");
  });
});

describe("POST /domains/bulk", () => {
  it("dryRun:true returns accepted/rejected without persisting", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/domains/bulk", {
        method: "POST",
        body: JSON.stringify({ dryRun: true, domains: [{ fqdn: "valid.com" }, { fqdn: "also-valid.com" }, { fqdn: "!invalid" }] }),
      }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { accepted: unknown[]; rejected: unknown[]; dryRun: boolean };
    expect(body.dryRun).toBe(true);
    expect(body.accepted.length).toBe(2);
    expect(body.rejected.length).toBe(1);

    const listRes = await handleAdmin(authReq("/domains"), env, NOOP_CTX);
    const list = await listRes.json() as unknown[];
    expect(list.length).toBe(0);
  });

  it("without dryRun persists valid domains", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/domains/bulk", { method: "POST", body: JSON.stringify({ domains: [{ fqdn: "a.com" }, { fqdn: "b.com" }] }) }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { accepted: unknown[] };
    expect(body.accepted.length).toBe(2);
  });
});

describe("GET /channels", () => {
  it("returns empty array initially", async () => {
    const env = makeEnv();
    const res = await handleAdmin(authReq("/channels"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });
});

describe("POST /channels — webhook allowed", () => {
  it("returns 201 for Teams webhook on allowed host", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/channels", {
        method: "POST",
        body: JSON.stringify({ type: "webhook-teams", target: "https://myorg.webhook.office.com/webhookb2/test", label: "Teams alerts" }),
      }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; type: string };
    expect(typeof body.id).toBe("string");
    expect(body.type).toBe("webhook-teams");
  });
});

describe("POST /channels — webhook disallowed", () => {
  it("returns 400 with validation_failed for disallowed webhook host", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/channels", {
        method: "POST",
        body: JSON.stringify({ type: "webhook-generic", target: "https://evil.notallowed.example.com/hook", label: "Bad webhook" }),
      }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("validation_failed");
  });
});

describe("DELETE /channels/:id — channel in use", () => {
  it("returns 409 channel_in_use when domain references it without force", async () => {
    const channelId = "ch-abc-123";
    const env = makeEnv({
      channels: [{ id: channelId, type: "webhook-teams", target: "https://myorg.webhook.office.com/test", label: null, disabled: 0, last_delivery_result: null, last_delivery_at: null }],
      domain_channels: [{ fqdn: "test.com", channel_id: channelId }],
    });
    const res = await handleAdmin(authReq(`/channels/${channelId}`, { method: "DELETE" }), env, NOOP_CTX);
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; domains: string[] };
    expect(body.error).toBe("channel_in_use");
    expect(body.domains).toContain("test.com");
  });

  it("deletes with ?force=true even when referenced", async () => {
    const channelId = "ch-force-del";
    const env = makeEnv({
      channels: [{ id: channelId, type: "webhook-slack", target: "https://hooks.slack.com/services/T/B/x", label: null, disabled: 0, last_delivery_result: null, last_delivery_at: null }],
      domain_channels: [{ fqdn: "test.com", channel_id: channelId }],
    });
    const res = await handleAdmin(authReq(`/channels/${channelId}?force=true`, { method: "DELETE" }), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as { deleted: boolean };
    expect(body.deleted).toBe(true);
  });
});

describe("GET /budget", () => {
  it("returns 200 with BudgetReport shape", async () => {
    const env = makeEnv();
    const res = await handleAdmin(authReq("/budget"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as { peakDuePerMinute: number; checksPerDay: number; withinFreeTier: boolean; warnings: unknown[]; headroom: number };
    expect(typeof body.peakDuePerMinute).toBe("number");
    expect(typeof body.checksPerDay).toBe("number");
    expect(typeof body.withinFreeTier).toBe("boolean");
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(typeof body.headroom).toBe("number");
  });

  it("withinFreeTier is true for empty domain list", async () => {
    const env = makeEnv();
    const res = await handleAdmin(authReq("/budget"), env, NOOP_CTX);
    const body = await res.json() as { withinFreeTier: boolean; headroom: number };
    expect(body.withinFreeTier).toBe(true);
    expect(body.headroom).toBe(45);
  });
});

describe("GET /events", () => {
  it("returns 200 with empty array when no events", async () => {
    const env = makeEnv();
    const res = await handleAdmin(authReq("/events"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("GET /", () => {
  it("delegates to ASSETS binding and returns 200 text/html when ASSETS is present", async () => {
    const mockAssets = {
      fetch: async (_req: Request) =>
        new Response("<html><body>dashboard</body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
    };
    const env = makeEnv(undefined, mockAssets);
    const res = await handleAdmin(noAuthReq("/"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("dashboard");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src");
    expect(csp).toContain("unsafe-inline");
  });

  it("returns 200 with fallback text when ASSETS binding is absent", async () => {
    const env = makeEnv();
    const res = await handleAdmin(noAuthReq("/"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("domain-drop-watcher");
  });
});

describe("security headers", () => {
  it("JSON responses have X-Content-Type-Options: nosniff", async () => {
    const env = makeEnv();
    const res = await handleAdmin(noAuthReq("/health"), env, NOOP_CTX);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("/ response has CSP header", async () => {
    const env = makeEnv();
    const res = await handleAdmin(noAuthReq("/"), env, NOOP_CTX);
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src");
  });
});

// ---------------------------------------------------------------------------
// GET /login
// ---------------------------------------------------------------------------

describe("GET /login", () => {
  it("returns 200 HTML with full login form when users exist", async () => {
    const env = makeEnv();
    await mintSessionCookie(env, "alice@example.com");
    const res = await handleAdmin(noAuthReq("/login"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("email-form");
    expect(body).toContain("passkey-section");
  });

  it("shows empty-allowlist banner + all forms when no users exist", async () => {
    const env = makeEnv();
    const res = await handleAdmin(noAuthReq("/login"), env, NOOP_CTX);
    const body = await res.text();
    expect(body).toContain("No users configured yet");
    expect(body).toContain("token-form");
    expect(body).toContain('id="email-form"');
    expect(body).toContain('id="passkey-section"');
  });

  it("does not show banner when users exist", async () => {
    const env = makeEnv();
    await mintSessionCookie(env, "alice@example.com");
    const res = await handleAdmin(noAuthReq("/login"), env, NOOP_CTX);
    const body = await res.text();
    expect(body).not.toContain("No users configured yet");
  });

  it("has X-Frame-Options: DENY", async () => {
    const env = makeEnv();
    const res = await handleAdmin(noAuthReq("/login"), env, NOOP_CTX);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("CSP includes frame-ancestors 'none'", async () => {
    const env = makeEnv();
    const res = await handleAdmin(noAuthReq("/login"), env, NOOP_CTX);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

// ---------------------------------------------------------------------------
// POST /login/email-code
// ---------------------------------------------------------------------------

describe("POST /login/email-code — allowlisted email", () => {
  it("returns 202, inserts login_codes row, queues EMAIL.send", async () => {
    const env = makeEnv();
    const sends: unknown[] = [];
    env.EMAIL = { send: async (msg: unknown) => { sends.push(msg); } };

    await mintSessionCookie(env, "alice@example.com");

    const captures: Promise<unknown>[] = [];
    const ctx: ExecutionContext = { waitUntil: (p: Promise<unknown>) => captures.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;

    const res = await handleAdmin(
      new Request("https://example.workers.dev/login/email-code", {
        method: "POST",
        headers: { "content-type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
        body: JSON.stringify({ email: "alice@example.com" }),
      }),
      env, ctx,
    );

    expect(res.status).toBe(202);
    const body = await res.json() as { ok: boolean; message: string };
    expect(body.ok).toBe(true);
    expect(body.message).toContain("on its way");

    // Flush all waitUntil promises
    await Promise.all(captures);

    const db = env.DB as unknown as { _tables: { login_codes: Row[]; login_attempts: Row[] } };
    expect(db._tables.login_codes.length).toBe(1);
    expect(sends.length).toBe(1);
    const msg = sends[0] as { subject: string; text: string };
    expect(msg.subject).toContain("domain-drop-watcher sign-in code:");
    expect(msg.text).not.toMatch(/https?:\/\//);
  });
});

describe("POST /login/email-code — non-allowlisted email", () => {
  it("returns 202, no login_codes row, no email send, auth_events login_fail", async () => {
    const env = makeEnv();
    const sends: unknown[] = [];
    env.EMAIL = { send: async (msg: unknown) => { sends.push(msg); } };

    const captures: Promise<unknown>[] = [];
    const ctx: ExecutionContext = { waitUntil: (p: Promise<unknown>) => captures.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;

    const res = await handleAdmin(
      new Request("https://example.workers.dev/login/email-code", {
        method: "POST",
        headers: { "content-type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
        body: JSON.stringify({ email: "unknown@example.com" }),
      }),
      env, ctx,
    );

    expect(res.status).toBe(202);
    await Promise.all(captures);

    const db = env.DB as unknown as { _tables: { login_codes: Row[]; auth_events: Row[] } };
    expect(db._tables.login_codes.length).toBe(0);
    expect(sends.length).toBe(0);

    const failEvent = db._tables.auth_events.find((e) => e["event_type"] === "login_fail");
    expect(failEvent).toBeDefined();
    const meta = JSON.parse(failEvent?.["metadata"] as string ?? "{}") as { reason: string };
    expect(meta.reason).toBe("unknown_email");
  });
});

describe("POST /login/email-code — rate limited", () => {
  it("returns 429 with Retry-After, no login_codes row inserted", async () => {
    const env = makeEnv();
    await mintSessionCookie(env, "alice@example.com");

    // Seed 3 existing attempts to hit burst cap
    const db = env.DB as unknown as { _tables: { login_attempts: Row[] } };
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 3; i++) {
      db._tables.login_attempts.push({ subject_type: "email", subject_key: "alice@example.com", ts: now - 10, event_type: "code_sent" });
    }

    const res = await handleAdmin(
      new Request("https://example.workers.dev/login/email-code", {
        method: "POST",
        headers: { "content-type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
        body: JSON.stringify({ email: "alice@example.com" }),
      }),
      env, NOOP_CTX,
    );

    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const codeRow = (env.DB as unknown as { _tables: { login_codes: Row[] } })._tables.login_codes;
    expect(codeRow.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /login/verify-code
// ---------------------------------------------------------------------------

describe("POST /login/verify-code — missing Origin header", () => {
  it("returns 403 when Origin header is absent", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      new Request("https://example.workers.dev/login/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com", code: "123456" }),
      }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when Origin header does not match worker origin", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      new Request("https://example.workers.dev/login/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json", "Origin": "https://evil.example.com" },
        body: JSON.stringify({ email: "alice@example.com", code: "123456" }),
      }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /login/verify-code — wrong code", () => {
  it("returns 401 on code mismatch, logs code_verify_fail", async () => {
    const env = makeEnv();

    const captures: Promise<unknown>[] = [];
    const ctx: ExecutionContext = { waitUntil: (p: Promise<unknown>) => captures.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;

    const res = await handleAdmin(
      new Request("https://example.workers.dev/login/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json", "Origin": "https://example.workers.dev", "CF-Connecting-IP": "1.2.3.4" },
        body: JSON.stringify({ email: "alice@example.com", code: "999999" }),
      }),
      env, ctx,
    );

    await Promise.all(captures);
    expect(res.status).toBe(401);
    const db = env.DB as unknown as { _tables: { login_attempts: Row[] } };
    const failAttempt = db._tables.login_attempts.find((a) => a["event_type"] === "code_verify_fail");
    expect(failAttempt).toBeDefined();
  });
});

describe("POST /login/verify-code — happy path", () => {
  it("sets cookie, creates session row, logs login_ok", async () => {
    const env = makeEnv();

    // Seed user + a valid login code
    const now = Math.floor(Date.now() / 1000);
    const db = env.DB;
    await db.prepare(
      "INSERT INTO users (email, user_id, added_at, last_login_at, disabled, role) VALUES (?, ?, ?, NULL, 0, 'admin')",
    ).bind("bob@example.com", crypto.randomUUID(), now).run();

    const { hashLoginCode } = await import("../src/auth/magic-link.js");
    const code = "042042";
    const hash = await hashLoginCode(env, "bob@example.com", code);
    const tables = (db as unknown as { _tables: { login_codes: Row[] } })._tables;
    tables.login_codes.push({ code_hash: hash, email: "bob@example.com", created_at: now - 30, expires_at: now + 570, used_at: null, verify_attempts: 0 });

    const captures: Promise<unknown>[] = [];
    const ctx: ExecutionContext = { waitUntil: (p: Promise<unknown>) => captures.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;

    const res = await handleAdmin(
      new Request("https://example.workers.dev/login/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json", "Origin": "https://example.workers.dev", "CF-Connecting-IP": "1.2.3.4" },
        body: JSON.stringify({ email: "bob@example.com", code }),
      }),
      env, ctx,
    );

    await Promise.all(captures);
    expect(res.status).toBe(200);

    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("dropwatch_session=");
    expect(cookie).toContain("HttpOnly");

    const body = await res.json() as { ok: boolean; redirect: string };
    expect(body.ok).toBe(true);
    expect(body.redirect).toBe("/");

    const sessions = (env.DB as unknown as { _tables: { sessions: Row[]; auth_events: Row[] } })._tables;
    expect(sessions.sessions.length).toBe(1);
    const loginOk = sessions.auth_events.find((e) => e["event_type"] === "login_ok");
    expect(loginOk).toBeDefined();
    expect(loginOk?.["auth_method"]).toBe("email-code");
  });
});

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------

describe("POST /logout", () => {
  it("revokes session and clears cookie", async () => {
    const env = makeEnv();
    const cookieValue = await mintSessionCookie(env, "alice@example.com");

    const res = await handleAdmin(
      sessionReq("/logout", cookieValue, { method: "POST" }),
      env, NOOP_CTX,
    );

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("Max-Age=0");

    // Session should be gone
    const tables = (env.DB as unknown as { _tables: { sessions: Row[] } })._tables;
    expect(tables.sessions.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// /users CRUD
// ---------------------------------------------------------------------------

describe("/users CRUD", () => {
  it("GET /users returns user list with activeSessions count", async () => {
    const env = makeEnv();
    const cookieValue = await mintSessionCookie(env, "admin@example.com");

    const res = await handleAdmin(sessionReq("/users", cookieValue), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ email: string; activeSessions: number }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0]?.email).toBe("admin@example.com");
    expect(typeof body[0]?.activeSessions).toBe("number");
  });

  it("POST /users adds a new user and returns 201", async () => {
    const env = makeEnv();
    const cookieValue = await mintSessionCookie(env, "admin@example.com");

    const captures: Promise<unknown>[] = [];
    const ctx: ExecutionContext = { waitUntil: (p: Promise<unknown>) => captures.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;

    const res = await handleAdmin(
      sessionReq("/users", cookieValue, { method: "POST", body: JSON.stringify({ email: "newuser@example.com" }) }),
      env, ctx,
    );
    await Promise.all(captures);

    expect(res.status).toBe(201);
    const body = await res.json() as { email: string };
    expect(body.email).toBe("newuser@example.com");

    const events = (env.DB as unknown as { _tables: { auth_events: Row[] } })._tables.auth_events;
    const addedEvent = events.find((e) => e["event_type"] === "user_added");
    expect(addedEvent).toBeDefined();
    const meta = JSON.parse(addedEvent?.["metadata"] as string ?? "{}") as { actor: string };
    expect(meta.actor).toBe("admin@example.com");
  });

  it("POST /users returns 409 for duplicate email", async () => {
    const env = makeEnv();
    const cookieValue = await mintSessionCookie(env, "admin@example.com");

    const res1 = await handleAdmin(
      sessionReq("/users", cookieValue, { method: "POST", body: JSON.stringify({ email: "dup@example.com" }) }),
      env, NOOP_CTX,
    );
    expect(res1.status).toBe(201);

    const res2 = await handleAdmin(
      sessionReq("/users", cookieValue, { method: "POST", body: JSON.stringify({ email: "dup@example.com" }) }),
      env, NOOP_CTX,
    );
    expect(res2.status).toBe(409);
    const body = await res2.json() as { error: string };
    expect(body.error).toBe("user_exists");
  });

  it("POST /users returns 400 for malformed email", async () => {
    const env = makeEnv();
    const cookieValue = await mintSessionCookie(env, "admin@example.com");
    const res = await handleAdmin(
      sessionReq("/users", cookieValue, { method: "POST", body: JSON.stringify({ email: "notanemail" }) }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(400);
  });

  it("DELETE /users/:email removes user and returns {deleted:true}", async () => {
    const env = makeEnv();
    const cookieValue = await mintSessionCookie(env, "admin@example.com");

    await handleAdmin(
      sessionReq("/users", cookieValue, { method: "POST", body: JSON.stringify({ email: "todelete@example.com" }) }),
      env, NOOP_CTX,
    );

    const captures: Promise<unknown>[] = [];
    const ctx: ExecutionContext = { waitUntil: (p: Promise<unknown>) => captures.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;

    const res = await handleAdmin(
      sessionReq("/users/todelete@example.com", cookieValue, { method: "DELETE" }),
      env, ctx,
    );
    await Promise.all(captures);

    expect(res.status).toBe(200);
    const body = await res.json() as { deleted: boolean };
    expect(body.deleted).toBe(true);

    const events = (env.DB as unknown as { _tables: { auth_events: Row[] } })._tables.auth_events;
    expect(events.find((e) => e["event_type"] === "user_removed")).toBeDefined();
  });

  it("POST /users/:email/disable disables user", async () => {
    const env = makeEnv();
    const cookieValue = await mintSessionCookie(env, "admin@example.com");

    await handleAdmin(
      sessionReq("/users", cookieValue, { method: "POST", body: JSON.stringify({ email: "victim@example.com" }) }),
      env, NOOP_CTX,
    );

    const res = await handleAdmin(
      sessionReq("/users/victim@example.com/disable", cookieValue, { method: "POST" }),
      env, NOOP_CTX,
    );
    expect(res.status).toBe(200);

    const users = (env.DB as unknown as { _tables: { users: Row[] } })._tables.users;
    const victim = users.find((u) => u["email"] === "victim@example.com");
    expect(victim?.["disabled"]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// /sessions revoke-all
// ---------------------------------------------------------------------------

describe("POST /sessions/revoke-all", () => {
  it("deletes all sessions for current user and clears cookie", async () => {
    const env = makeEnv();
    const cookieValue = await mintSessionCookie(env, "alice@example.com");
    // Mint a second session for the same user
    await createSession(env, env.DB, { email: "alice@example.com", authMethod: "email-code" });

    const tables = (env.DB as unknown as { _tables: { sessions: Row[] } })._tables;
    expect(tables.sessions.length).toBe(2);

    const res = await handleAdmin(
      sessionReq("/sessions/revoke-all", cookieValue, { method: "POST" }),
      env, NOOP_CTX,
    );

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("Max-Age=0");
    expect(tables.sessions.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /auth/health (bearer-only)
// ---------------------------------------------------------------------------

describe("GET /auth/health", () => {
  it("returns health info when authenticated via bearer", async () => {
    const env = makeEnv();
    const res = await handleAdmin(authReq("/auth/health"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      email_routing_bound: boolean;
      alert_from_set: boolean;
      session_secret_set: boolean;
      admin_token_set: boolean;
      allowlist_size: number;
      rp_id: unknown;
      webauthn_available: boolean;
    };
    expect(typeof body.email_routing_bound).toBe("boolean");
    expect(typeof body.admin_token_set).toBe("boolean");
    expect(body.webauthn_available).toBe(true);
    expect(typeof body.allowlist_size).toBe("number");
  });

  it("returns 403 when authenticated via session (not bearer)", async () => {
    const env = makeEnv();
    const cookieValue = await mintSessionCookie(env, "alice@example.com");
    const res = await handleAdmin(sessionReq("/auth/health", cookieValue), env, NOOP_CTX);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /auth/empty-allowlist-status (public endpoint)
// ---------------------------------------------------------------------------

describe("GET /auth/empty-allowlist-status", () => {
  it("returns {empty:true} when no users exist", async () => {
    const env = makeEnv();
    const res = await handleAdmin(noAuthReq("/auth/empty-allowlist-status"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as { empty: boolean };
    expect(body.empty).toBe(true);
  });

  it("returns {empty:false} when at least one user exists", async () => {
    const env = makeEnv();
    await mintSessionCookie(env, "alice@example.com");
    const res = await handleAdmin(noAuthReq("/auth/empty-allowlist-status"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as { empty: boolean };
    expect(body.empty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /config/app + PUT /config/app/alert_from_address + webhook_host_allowlist
// ---------------------------------------------------------------------------

describe("GET /config/app", () => {
  it("returns null values and defaults when no config rows exist", async () => {
    const env = makeEnv();
    const res = await handleAdmin(authReq("/config/app"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      alert_from_address: string | null;
      webhook_host_allowlist: string | null;
      defaults: { webhook_host_allowlist: string };
    };
    expect(body.alert_from_address).toBeNull();
    expect(body.webhook_host_allowlist).toBeNull();
    expect(typeof body.defaults.webhook_host_allowlist).toBe("string");
    expect(body.defaults.webhook_host_allowlist.length).toBeGreaterThan(0);
  });

  it("returns stored values after PUT", async () => {
    const env = makeEnv();
    await handleAdmin(
      authReq("/config/app/alert_from_address", {
        method: "PUT",
        body: JSON.stringify({ value: "saved@example.com" }),
      }),
      env,
      NOOP_CTX,
    );
    const res = await handleAdmin(authReq("/config/app"), env, NOOP_CTX);
    expect(res.status).toBe(200);
    const body = await res.json() as { alert_from_address: string | null };
    expect(body.alert_from_address).toBe("saved@example.com");
  });

  it("returns 401 without auth", async () => {
    const env = makeEnv();
    const res = await handleAdmin(noAuthReq("/config/app"), env, NOOP_CTX);
    expect(res.status).toBe(401);
  });
});

describe("PUT /config/app/alert_from_address", () => {
  it("stores a valid email and returns {ok:true, value}", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/config/app/alert_from_address", {
        method: "PUT",
        body: JSON.stringify({ value: "alerts@example.com" }),
      }),
      env,
      NOOP_CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; value: string };
    expect(body.ok).toBe(true);
    expect(body.value).toBe("alerts@example.com");
  });

  it("rejects invalid email with 400 and reason:invalid_email", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/config/app/alert_from_address", {
        method: "PUT",
        body: JSON.stringify({ value: "not-an-email" }),
      }),
      env,
      NOOP_CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { reason: string };
    expect(body.reason).toBe("invalid_email");
  });

  it("empty value deletes the row and returns {ok:true, value:null}", async () => {
    const env = makeEnv();
    await handleAdmin(
      authReq("/config/app/alert_from_address", {
        method: "PUT",
        body: JSON.stringify({ value: "first@example.com" }),
      }),
      env,
      NOOP_CTX,
    );
    const res = await handleAdmin(
      authReq("/config/app/alert_from_address", {
        method: "PUT",
        body: JSON.stringify({ value: "" }),
      }),
      env,
      NOOP_CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; value: null };
    expect(body.ok).toBe(true);
    expect(body.value).toBeNull();

    const get = await handleAdmin(authReq("/config/app"), env, NOOP_CTX);
    const getBody = await get.json() as { alert_from_address: null };
    expect(getBody.alert_from_address).toBeNull();
  });

  it("writes a config_updated auth_event row on successful PUT", async () => {
    const env = makeEnv();
    await handleAdmin(
      authReq("/config/app/alert_from_address", {
        method: "PUT",
        body: JSON.stringify({ value: "audit@example.com" }),
      }),
      env,
      NOOP_CTX,
    );
    const db = env.DB as unknown as { _tables: { auth_events: { event_type: string; metadata: string }[] } };
    const row = db._tables.auth_events.find((r) => r.event_type === "config_updated");
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadata);
    expect(meta.key).toBe("app.alert_from_address");
    expect(meta.new_value_set).toBe(true);
  });
});

describe("PUT /config/app/webhook_host_allowlist", () => {
  it("stores a valid allowlist", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/config/app/webhook_host_allowlist", {
        method: "PUT",
        body: JSON.stringify({ value: "foo.example.com,bar.example.com" }),
      }),
      env,
      NOOP_CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; value: string };
    expect(body.ok).toBe(true);
    expect(body.value).toBe("foo.example.com,bar.example.com");
  });

  it("rejects entry containing :// with 400", async () => {
    const env = makeEnv();
    const res = await handleAdmin(
      authReq("/config/app/webhook_host_allowlist", {
        method: "PUT",
        body: JSON.stringify({ value: "https://foo.example.com" }),
      }),
      env,
      NOOP_CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { reason: string };
    expect(body.reason).toBe("entry_must_not_contain_scheme");
  });

  it("empty value deletes the row", async () => {
    const env = makeEnv();
    await handleAdmin(
      authReq("/config/app/webhook_host_allowlist", {
        method: "PUT",
        body: JSON.stringify({ value: "foo.example.com" }),
      }),
      env,
      NOOP_CTX,
    );
    const res = await handleAdmin(
      authReq("/config/app/webhook_host_allowlist", {
        method: "PUT",
        body: JSON.stringify({ value: "" }),
      }),
      env,
      NOOP_CTX,
    );
    expect(res.status).toBe(200);
    const get = await handleAdmin(authReq("/config/app"), env, NOOP_CTX);
    const getBody = await get.json() as { webhook_host_allowlist: null };
    expect(getBody.webhook_host_allowlist).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DEMO_MODE gate — /login/email-code + /login/verify-code
// ---------------------------------------------------------------------------

describe("DEMO_MODE gate — /login/email-code", () => {
  it("/login/email-code returns 404 for non-admin email when DEMO_MODE=1", async () => {
    const db = makeD1();
    await db.prepare("INSERT INTO users (email,user_id,added_at,disabled) VALUES (?,?,?,0)").bind("admin@example.com", "u1", 0).run();
    await db.prepare("INSERT INTO users (email,user_id,added_at,disabled) VALUES (?,?,?,0)").bind("guest@example.com", "u2", 0).run();
    const env: Env = {
      DB: db,
      EVENTS: makeKV(),
      BOOTSTRAP: makeKV(),
      ADMIN_TOKEN: "correct-token",
      SESSION_SECRET: "test-session-secret-placeholder-for-unit-tests",
      VERSION: "0.1.0-test",
      ALERT_FROM_ADDRESS: "no-reply@example.com",
      EMAIL: { send: async () => {} },
      DEMO_MODE: "1",
      DEMO_ADMIN_EMAIL: "admin@example.com",
    };
    const req = new Request("https://x/login/email-code", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": "https://x" },
      body: JSON.stringify({ email: "guest@example.com" }),
    });
    const resp = await handleAdmin(req, env as any, NOOP_CTX);
    expect(resp.status).toBe(404);
  });
});

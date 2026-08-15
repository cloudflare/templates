import { describe, it, expect } from "vitest";
import {
  classifyRdapResponse,
  lookupDomain,
  resolveAuthoritativeBase,
} from "../src/rdap.js";
import type { KVNamespace } from "@cloudflare/workers-types";

// Minimal KVNamespace stub for tests
function makeMockKV(initial?: Record<string, unknown>): KVNamespace {
  const store: Record<string, string> = {};
  if (initial) {
    for (const [k, v] of Object.entries(initial)) {
      store[k] = JSON.stringify(v);
    }
  }
  return {
    get(key: string, opts?: { type?: string } | string) {
      const type = typeof opts === "string" ? opts : opts?.type;
      const val = store[key] ?? null;
      if (val === null) return Promise.resolve(null);
      if (type === "json") return Promise.resolve(JSON.parse(val) as unknown);
      return Promise.resolve(val);
    },
    put(key: string, value: string, _opts?: { expirationTtl?: number }) {
      store[key] = value;
      return Promise.resolve();
    },
    delete() { return Promise.resolve(); },
    list() { return Promise.resolve({ keys: [], list_complete: true, cursor: "" }); },
    getWithMetadata() { return Promise.resolve({ value: null, metadata: null }); },
  } as unknown as KVNamespace;
}

function makeFetch(status: number, body?: unknown): typeof fetch {
  return (_url: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(
      new Response(body !== undefined ? JSON.stringify(body) : null, { status }),
    );
}

function makeAbortFetch(): typeof fetch {
  return (_url: RequestInfo | URL, _init?: RequestInit) => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    return Promise.reject(err);
  };
}

const BOOTSTRAP = {
  services: [
    [["com", "net"], ["https://rdap.verisign.com/com/v1/"]],
    [["io"], ["https://rdap.nic.io/"]],
  ],
};

describe("classifyRdapResponse", () => {
  it("registered — no dropping flags, no expiration", () => {
    const result = classifyRdapResponse({ status: ["active"], events: [] });
    expect(result.status).toBe("registered");
    expect(result.rdapStatuses).toEqual([]);
  });

  it("dropping — exact camelCase pendingDelete in status[]", () => {
    const result = classifyRdapResponse({ status: ["pendingDelete"] });
    expect(result.status).toBe("dropping");
    expect(result.rdapStatuses).toContain("pendingDelete");
  });

  it("dropping — humanized 'Pending Delete' (mixed case + space)", () => {
    const result = classifyRdapResponse({ status: ["Pending Delete"] });
    expect(result.status).toBe("dropping");
    expect(result.rdapStatuses).toContain("Pending Delete");
  });

  it("dropping — redemptionPeriod + pendingRestore both returned in rdapStatuses", () => {
    const result = classifyRdapResponse({
      status: ["redemptionPeriod", "pendingRestore"],
    });
    expect(result.status).toBe("dropping");
    expect(result.rdapStatuses).toContain("redemptionPeriod");
    expect(result.rdapStatuses).toContain("pendingRestore");
    expect(result.rdapStatuses).toHaveLength(2);
  });

  it("expiring — expiration event 13 days out → expiring with correct expirationAt", () => {
    const nowMs = Date.now();
    const expMs = nowMs + 13 * 24 * 60 * 60 * 1000;
    const result = classifyRdapResponse(
      { events: [{ eventAction: "expiration", eventDate: new Date(expMs).toISOString() }] },
      { now: nowMs },
    );
    expect(result.status).toBe("expiring");
    expect(result.expirationAt).toBe(Math.floor(expMs / 1000));
  });

  it("registered — expiration event 365 days out (outside horizon)", () => {
    const nowMs = Date.now();
    const expMs = nowMs + 365 * 24 * 60 * 60 * 1000;
    const result = classifyRdapResponse(
      { events: [{ eventAction: "expiration", eventDate: new Date(expMs).toISOString() }] },
      { now: nowMs },
    );
    expect(result.status).toBe("registered");
  });
});

describe("lookupDomain", () => {
  it("404 response → available", async () => {
    const result = await lookupDomain("example.com", {
      fetchImpl: makeFetch(404),
      bootstrapKV: makeMockKV({ "bootstrap:iana-rdap-dns": BOOTSTRAP }),
    });
    expect(result.status).toBe("available");
  });

  it("503 response → indeterminate with reason http-503", async () => {
    const result = await lookupDomain("example.com", {
      fetchImpl: makeFetch(503),
      bootstrapKV: makeMockKV({ "bootstrap:iana-rdap-dns": BOOTSTRAP }),
    });
    expect(result.status).toBe("indeterminate");
    expect(result.reason).toBe("http-503");
  });

  it("AbortError → indeterminate with reason timeout", async () => {
    const result = await lookupDomain("example.com", {
      fetchImpl: makeAbortFetch(),
      bootstrapKV: makeMockKV({ "bootstrap:iana-rdap-dns": BOOTSTRAP }),
    });
    expect(result.status).toBe("indeterminate");
    expect(result.reason).toBe("timeout");
  });

  it("200 with pendingDelete → dropping", async () => {
    const result = await lookupDomain("example.com", {
      fetchImpl: makeFetch(200, { status: ["pendingDelete"] }),
      bootstrapKV: makeMockKV({ "bootstrap:iana-rdap-dns": BOOTSTRAP }),
    });
    expect(result.status).toBe("dropping");
    expect(result.rdapStatuses).toContain("pendingDelete");
    expect(result.source).toBe("https://rdap.verisign.com/com/v1");
  });
});

describe("resolveAuthoritativeBase", () => {
  it("returns base URL for known TLD with trailing slash stripped", async () => {
    const kv = makeMockKV({ "bootstrap:iana-rdap-dns": BOOTSTRAP });
    const base = await resolveAuthoritativeBase("com", { bootstrapKV: kv });
    expect(base).toBe("https://rdap.verisign.com/com/v1");
  });

  it("returns null for unknown TLD", async () => {
    const kv = makeMockKV({ "bootstrap:iana-rdap-dns": BOOTSTRAP });
    const base = await resolveAuthoritativeBase("xyz", { bootstrapKV: kv });
    expect(base).toBeNull();
  });
});

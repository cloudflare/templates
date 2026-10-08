import type { KVNamespace } from "@cloudflare/workers-types";
import { getBootstrap, setBootstrap } from "./kv.js";

export type RdapStatus =
  | "available"
  | "registered"
  | "dropping"
  | "expiring"
  | "indeterminate";

export interface RdapLookupResult {
  status: RdapStatus;
  raw?: unknown;
  source?: string;
  reason?: string;
  rdapStatuses?: string[];
  expirationAt?: number;
}

export interface RdapLookupOpts {
  bootstrapKV?: KVNamespace;
  fetchImpl?: typeof fetch;
  now?: () => number;
  expiringHorizonDays?: number;
  timeoutMs?: number;
  rdapBaseUrl?: string;
}

// RFC 9224 bootstrap shape
interface IanaBootstrap {
  services: Array<[string[], string[]]>;
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapDomainResponse {
  status?: string[];
  events?: RdapEvent[];
}

const DROPPING_TOKENS = new Set(["pendingdelete", "redemptionperiod", "pendingrestore"]);

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

export function classifyRdapResponse(
  json: unknown,
  opts?: { expiringHorizonDays?: number; now?: number },
): {
  status: Exclude<RdapStatus, "available" | "indeterminate">;
  rdapStatuses: string[];
  expirationAt?: number;
} {
  const horizonDays = opts?.expiringHorizonDays ?? 14;
  const nowMs = opts?.now ?? Date.now();

  const data = json as Partial<RdapDomainResponse>;
  const statuses: string[] = Array.isArray(data.status) ? (data.status as string[]) : [];

  const matched: string[] = [];
  for (const s of statuses) {
    if (typeof s === "string" && DROPPING_TOKENS.has(normalizeToken(s))) {
      matched.push(s);
    }
  }

  if (matched.length > 0) {
    return { status: "dropping", rdapStatuses: matched };
  }

  const events: RdapEvent[] = Array.isArray(data.events)
    ? (data.events as RdapEvent[])
    : [];

  for (const ev of events) {
    if (ev.eventAction === "expiration" && typeof ev.eventDate === "string") {
      const expMs = Date.parse(ev.eventDate);
      if (!isNaN(expMs)) {
        const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
        if (expMs - nowMs < horizonMs) {
          return { status: "expiring", rdapStatuses: [], expirationAt: Math.floor(expMs / 1000) };
        }
      }
    }
  }

  return { status: "registered", rdapStatuses: [] };
}

export async function resolveAuthoritativeBase(
  tld: string,
  opts?: { bootstrapKV?: KVNamespace; fetchImpl?: typeof fetch },
): Promise<string | null> {
  const fetchFn = opts?.fetchImpl ?? fetch;
  const normalized = tld.toLowerCase();

  let bootstrap: IanaBootstrap | null = null;

  if (opts?.bootstrapKV) {
    const cached = await getBootstrap(opts.bootstrapKV);
    if (cached) {
      bootstrap = cached as IanaBootstrap;
    }
  }

  if (!bootstrap) {
    const res = await fetchFn("https://data.iana.org/rdap/dns.json");
    bootstrap = (await res.json()) as IanaBootstrap;
    if (opts?.bootstrapKV) {
      await setBootstrap(opts.bootstrapKV, bootstrap);
    }
  }

  for (const [tlds, bases] of bootstrap.services) {
    if (tlds.includes(normalized) && bases.length > 0) {
      return (bases[0] as string).replace(/\/$/, "");
    }
  }

  return null;
}

export async function lookupDomain(
  fqdn: string,
  opts?: RdapLookupOpts,
): Promise<RdapLookupResult> {
  const fetchFn = opts?.fetchImpl ?? fetch;
  const nowFn = opts?.now ?? (() => Date.now());
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const expiringHorizonDays = opts?.expiringHorizonDays ?? 14;

  const lower = fqdn.toLowerCase();
  const labels = lower.split(".");
  const tld = labels[labels.length - 1] ?? "";

  let base: string | null;
  if (opts?.rdapBaseUrl) {
    base = opts.rdapBaseUrl.replace(/\/$/, "");
  } else {
    base = await resolveAuthoritativeBase(tld, {
      bootstrapKV: opts?.bootstrapKV,
      fetchImpl: fetchFn,
    });
  }

  if (base === null) {
    return { status: "indeterminate", reason: "no-bootstrap" };
  }

  let res: Response;
  try {
    res = await fetchFn(`${base}/domain/${lower}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return { status: "indeterminate", reason: "timeout" };
    }
    return { status: "indeterminate", reason: "network" };
  }

  if (res.status === 404) {
    return { status: "available" };
  }

  if (res.status !== 200) {
    return { status: "indeterminate", reason: `http-${res.status}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { status: "indeterminate", reason: "invalid-json" };
  }

  const classified = classifyRdapResponse(json, {
    expiringHorizonDays,
    now: nowFn(),
  });

  return {
    status: classified.status,
    raw: json,
    source: base,
    rdapStatuses: classified.rdapStatuses,
    expirationAt: classified.expirationAt,
  };
}

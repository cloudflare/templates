import type { Env, ChannelType, DomainRow } from "./types.js";
import {
  listDomains,
  getDomain,
  deleteDomain,
  updateDomain,
  upsertDomainWithBudgetCheck,
  listChannels,
  getChannel,
  createChannel,
  updateChannel,
  deleteChannel,
  getChannelsForDomain,
  linkChannel,
  unlinkChannel,
  getConfig,
  setConfig,
  getAppConfig,
  setAppConfig,
  deleteAppConfig,
} from "./db.js";
import { listEvents } from "./kv.js";
import { computeBudget, pickLeastLoadedOffset } from "./budget.js";
import { isWebhookAllowed, parseAllowlist } from "./webhooks.js";
import { getAlertFromAddress, getWebhookHostAllowlist } from "./env-config.js";
import { detectWebhookType } from "./alerts.js";
import { lookupDomain } from "./rdap.js";
import {
  verifySessionCookie,
  createSession,
  revokeSession,
  serializeSessionCookie,
  clearSessionCookie,
} from "./auth/session.js";
import { issueLoginCode, redeemLoginCode } from "./auth/magic-link.js";
import { checkSendCodeRate, checkVerifyCodeRate, recordLoginAttempt } from "./auth/rate-limit.js";
import {
  listUsers,
  addUser,
  removeUser,
  setUserDisabled,
  recordUserLogin,
  userCount,
  UserExistsError,
} from "./auth/users.js";
import {
  beginPasskeyRegistration,
  finishPasskeyRegistration,
  beginPasskeyLogin,
  finishPasskeyLogin,
  listPasskeysForUser,
  removePasskey,
  rpIdFor,
  originFor,
} from "./auth/passkey.js";

// ---------------------------------------------------------------------------
// Auth identity
// ---------------------------------------------------------------------------

export interface AuthIdentity {
  email: string | null;
  method: "session" | "bearer-break-glass" | "email-code" | "passkey";
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

const JSON_HEADERS: HeadersInit = {
  "content-type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};

const AUTH_PAGE_HEADERS: HeadersInit = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

const DASHBOARD_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'";

const SECURITY_HEADERS: HeadersInit = {
  "content-type": "text/plain",
  "Content-Security-Policy": DASHBOARD_CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function jsonErr(status: number, message: string, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...extra }, status);
}

async function checkRateLimit(kv: KVNamespace, ip: string, action: string, max: number, windowSec: number): Promise<boolean> {
  const key = `rate:${action}:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const raw = await kv.get(key);
  let attempts: number[] = raw ? JSON.parse(raw) : [];
  attempts = attempts.filter(t => now - t < windowSec);
  if (attempts.length >= max) return false;
  attempts.push(now);
  await kv.put(key, JSON.stringify(attempts), { expirationTtl: windowSec });
  return true;
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function resolveAdminToken(env: Env): string | null {
  const t = env.ADMIN_TOKEN?.trim();
  return t && t.length > 0 ? t : null;
}

// ---------------------------------------------------------------------------
// Unified authenticate middleware
// ---------------------------------------------------------------------------

async function authenticate(
  req: Request,
  env: Env,
  db: D1Database,
): Promise<AuthIdentity | null> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieMatch = /(?:^|;\s*)dropwatch_session=([^\s;]+)/.exec(cookieHeader);
  if (cookieMatch?.[1]) {
    const identity = await verifySessionCookie(env, db, cookieMatch[1]);
    if (identity) {
      return {
        email: identity.email,
        method: identity.authMethod as AuthIdentity["method"],
      };
    }
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/i.exec(authHeader);
  if (match) {
    const provided = match[1] ?? "";
    const token = resolveAdminToken(env);
    if (token && timingSafeEqual(provided, token)) {
      return { email: null, method: "bearer-break-glass" };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Auth event logging
// ---------------------------------------------------------------------------

async function logAuthEvent(
  db: D1Database,
  event: {
    email?: string | null;
    event_type: string;
    auth_method?: string | null;
    ip_address?: string | null;
    user_agent?: string | null;
    metadata?: string | null;
  },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO auth_events (ts, email, event_type, auth_method, ip_address, user_agent, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      now,
      event.email ?? null,
      event.event_type,
      event.auth_method ?? null,
      event.ip_address ?? null,
      event.user_agent ?? null,
      event.metadata ?? null,
    )
    .run();
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_NOTIFY_ON = new Set(["available", "dropping", "expiring", "registered"]);
const VALID_CHANNEL_TYPES = new Set<ChannelType>([
  "email",
  "webhook-generic",
  "webhook-teams",
  "webhook-slack",
  "webhook-discord",
]);
const FQDN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const EMAIL_RE = /^[A-Za-z0-9._+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const BASIC_EMAIL_RE = /^[^@]+@[^@]+$/;

interface ValidationOk<T> { ok: true; value: T }
interface ValidationFail { ok: false; errors: string[] }
type ValidationResult<T> = ValidationOk<T> | ValidationFail;

function validateFqdn(raw: unknown): { fqdn?: string; error?: string } {
  if (typeof raw !== "string" || raw.trim() === "") return { error: "fqdn: required string" };
  const lower = raw.trim().toLowerCase();
  if (!FQDN_RE.test(lower)) return { error: `fqdn: invalid format '${lower}'` };
  return { fqdn: lower };
}

function validateCadence(raw: unknown, fallback: number): { cadence?: number; error?: string } {
  if (raw === undefined || raw === null) return { cadence: fallback };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 1440) return { error: "cadenceMinutes: integer [1..1440]" };
  return { cadence: n };
}

function validateNotifyOn(raw: unknown): { notifyOn?: string[]; error?: string } {
  if (raw === undefined || raw === null) return { notifyOn: ["available", "dropping"] };
  if (!Array.isArray(raw)) return { error: "notifyOn: must be array" };
  const invalid = (raw as unknown[]).filter((v) => typeof v !== "string" || !VALID_NOTIFY_ON.has(v as string));
  if (invalid.length > 0) return { error: `notifyOn: invalid values: ${invalid.join(", ")}` };
  return { notifyOn: raw as string[] };
}

async function validateChannelIds(
  db: D1Database,
  raw: unknown,
): Promise<{ channels?: string[]; error?: string }> {
  if (raw === undefined || raw === null) return { channels: [] };
  if (!Array.isArray(raw)) return { error: "channels: must be array" };
  const ids = raw as unknown[];
  if (ids.some((v) => typeof v !== "string")) return { error: "channels: all entries must be strings" };
  const strIds = ids as string[];
  for (const id of strIds) {
    const ch = await getChannel(db, id);
    if (!ch) return { error: `channels: channel '${id}' not found` };
  }
  return { channels: strIds };
}

interface DomainInput {
  fqdn: string;
  cadenceMinutes: number;
  channels: string[];
  notifyOn: string[];
  label?: string;
}

async function validateDomainInput(
  db: D1Database,
  body: Record<string, unknown>,
  defaultCadence: number,
): Promise<ValidationResult<DomainInput>> {
  const errors: string[] = [];

  const fqdnResult = validateFqdn(body["fqdn"]);
  if (fqdnResult.error) errors.push(fqdnResult.error);

  const cadenceResult = validateCadence(body["cadenceMinutes"], defaultCadence);
  if (cadenceResult.error) errors.push(cadenceResult.error);

  const notifyOnResult = validateNotifyOn(body["notifyOn"]);
  if (notifyOnResult.error) errors.push(notifyOnResult.error);

  const channelResult = await validateChannelIds(db, body["channels"]);
  if (channelResult.error) errors.push(channelResult.error);

  if (errors.length > 0) return { ok: false, errors };

  const label = typeof body["label"] === "string" ? body["label"] : undefined;

  return {
    ok: true,
    value: {
      fqdn: fqdnResult.fqdn!,
      cadenceMinutes: cadenceResult.cadence!,
      channels: channelResult.channels!,
      notifyOn: notifyOnResult.notifyOn!,
      label,
    },
  };
}

async function getDefaultCadence(db: D1Database): Promise<number> {
  const v = await getConfig(db, "default_cadence_minutes");
  if (v) {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return 60;
}

async function buildBudgetSnapshot(db: D1Database): Promise<ReturnType<typeof computeBudget>> {
  const domains = await listDomains(db, { includePaused: true });
  return computeBudget({
    domains: domains.map((d) => ({
      cadenceMinutes: d.cadence_minutes,
      phaseOffsetMinutes: d.phase_offset_minutes,
      paused: d.paused !== 0,
      tldSupported: d.tld_supported !== 0,
    })),
  });
}

async function insertDomainWithChannels(
  db: D1Database,
  input: DomainInput,
): Promise<{ inserted: boolean; reason?: string; domain?: DomainRow }> {
  const allDomains = await listDomains(db, { includePaused: true });
  const existingForOffset = allDomains
    .filter((d) => d.paused === 0 && d.tld_supported !== 0)
    .map((d) => ({ cadenceMinutes: d.cadence_minutes, phaseOffsetMinutes: d.phase_offset_minutes }));

  const offset = pickLeastLoadedOffset(existingForOffset, input.cadenceMinutes);
  const now = Math.floor(Date.now() / 1000);

  const result = await upsertDomainWithBudgetCheck(
    db,
    {
      fqdn: input.fqdn,
      cadence_minutes: input.cadenceMinutes,
      phase_offset_minutes: offset,
      next_due_at: now,
      paused: 0,
      notify_on: JSON.stringify(input.notifyOn),
      label: input.label ?? null,
      tld_supported: 1,
    },
    45,
  );

  if (!result.inserted) return { inserted: false, reason: result.reason };

  for (const chId of input.channels) {
    await linkChannel(db, input.fqdn, chId);
  }

  const domain = await getDomain(db, input.fqdn);
  return { inserted: true, domain: domain ?? undefined };
}

// ---------------------------------------------------------------------------
// Domain + channel handlers
// ---------------------------------------------------------------------------

async function handleGetDomains(env: Env): Promise<Response> {
  const domains = await listDomains(env.DB, { includePaused: true });
  const result = await Promise.all(
    domains.map(async (d) => {
      const channels = await getChannelsForDomain(env.DB, d.fqdn);
      return { ...d, notify_on: JSON.parse(d.notify_on) as unknown, channel_ids: channels.map((c) => c.id) };
    }),
  );
  return json(result);
}

async function handlePostDomain(req: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "validation_failed", { details: ["body: invalid JSON"] });
  }

  const defaultCadence = await getDefaultCadence(env.DB);
  const validation = await validateDomainInput(env.DB, body, defaultCadence);
  if (!validation.ok) return jsonErr(400, "validation_failed", { details: validation.errors });

  const budgetBefore = await buildBudgetSnapshot(env.DB);
  const { inserted, reason, domain } = await insertDomainWithChannels(env.DB, validation.value);

  if (!inserted) {
    const budgetAfter = await buildBudgetSnapshot(env.DB);
    return jsonErr(400, "budget_exceeded", { reason, budgetBefore, budgetAfter });
  }

  return json(domain, 201);
}

async function handlePostDomainsBulk(req: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "validation_failed", { details: ["body: invalid JSON"] });
  }

  const rawDomains = body["domains"];
  if (!Array.isArray(rawDomains)) {
    return jsonErr(400, "validation_failed", { details: ["domains: required array"] });
  }

  const dryRun = body["dryRun"] === true;
  const defaultCadence = await getDefaultCadence(env.DB);
  const budgetBefore = await buildBudgetSnapshot(env.DB);

  const accepted: DomainRow[] = [];
  const rejected: Array<{ fqdn: unknown; reason: string }> = [];

  for (const item of rawDomains as unknown[]) {
    const itemBody = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const validation = await validateDomainInput(env.DB, itemBody, defaultCadence);
    if (!validation.ok) {
      rejected.push({ fqdn: itemBody["fqdn"], reason: validation.errors.join("; ") });
      continue;
    }

    if (dryRun) {
      accepted.push({
        fqdn: validation.value.fqdn,
        added_at: 0,
        cadence_minutes: validation.value.cadenceMinutes,
        phase_offset_minutes: 0,
        next_due_at: 0,
        paused: 0,
        last_status: null,
        last_status_changed_at: null,
        last_checked_at: null,
        pending_confirm_status: null,
        pending_confirm_count: null,
        notify_on: JSON.stringify(validation.value.notifyOn),
        label: validation.value.label ?? null,
        tld_supported: 1,
      });
    } else {
      const { inserted, reason, domain } = await insertDomainWithChannels(env.DB, validation.value);
      if (inserted && domain) {
        accepted.push(domain);
      } else {
        rejected.push({ fqdn: validation.value.fqdn, reason: reason ?? "budget_exceeded" });
      }
    }
  }

  const budgetAfter = dryRun ? budgetBefore : await buildBudgetSnapshot(env.DB);
  return json({ accepted, rejected, budgetBefore, budgetAfter, dryRun });
}

async function handleGetDomain(fqdn: string, env: Env): Promise<Response> {
  const domain = await getDomain(env.DB, fqdn);
  if (!domain) return jsonErr(404, "not_found");

  const events = await listEvents(env.EVENTS, { fqdn, limit: 20 });
  const channels = await getChannelsForDomain(env.DB, fqdn);
  return json({
    ...domain,
    notify_on: JSON.parse(domain.notify_on) as unknown,
    channel_ids: channels.map((c) => c.id),
    events,
  });
}

async function handlePatchDomain(fqdn: string, req: Request, env: Env): Promise<Response> {
  const domain = await getDomain(env.DB, fqdn);
  if (!domain) return jsonErr(404, "not_found");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "validation_failed", { details: ["body: invalid JSON"] });
  }

  const errors: string[] = [];
  const patch: Partial<{ cadence_minutes: number; paused: number; notify_on: string; label: string }> = {};
  let newCadence: number | undefined;
  let newPhaseOffset: number | undefined;

  if (body["cadenceMinutes"] !== undefined) {
    const res = validateCadence(body["cadenceMinutes"], domain.cadence_minutes);
    if (res.error) errors.push(res.error);
    else if (res.cadence !== undefined) {
      patch.cadence_minutes = res.cadence;
      newCadence = res.cadence;
    }
  }

  if (body["paused"] !== undefined) {
    if (typeof body["paused"] !== "boolean") errors.push("paused: must be boolean");
    else patch.paused = body["paused"] ? 1 : 0;
  }

  if (body["notifyOn"] !== undefined) {
    const res = validateNotifyOn(body["notifyOn"]);
    if (res.error) errors.push(res.error);
    else if (res.notifyOn) patch.notify_on = JSON.stringify(res.notifyOn);
  }

  if (body["label"] !== undefined) {
    if (typeof body["label"] !== "string") errors.push("label: must be string");
    else patch.label = body["label"];
  }

  if (errors.length > 0) return jsonErr(400, "validation_failed", { details: errors });

  if (newCadence !== undefined && newCadence !== domain.cadence_minutes) {
    const allDomains = await listDomains(env.DB, { includePaused: true });
    const othersForOffset = allDomains
      .filter((d) => d.fqdn !== fqdn && d.paused === 0 && d.tld_supported !== 0)
      .map((d) => ({ cadenceMinutes: d.cadence_minutes, phaseOffsetMinutes: d.phase_offset_minutes }));
    const offset = pickLeastLoadedOffset(othersForOffset, newCadence);
    const simulated = [
      ...othersForOffset,
      { cadenceMinutes: newCadence, phaseOffsetMinutes: offset },
    ];
    const budgetCheck = computeBudget({
      domains: simulated.map((d) => ({ ...d, paused: false, tldSupported: true })),
    });
    if (budgetCheck.peakDuePerMinute > 45) {
      return jsonErr(400, "budget_exceeded", { budget: budgetCheck });
    }
    newPhaseOffset = offset;
    await env.DB.prepare(`UPDATE domains SET cadence_minutes = ?, phase_offset_minutes = ? WHERE fqdn = ?`)
      .bind(newCadence, offset, fqdn)
      .run();
    delete patch.cadence_minutes;
  }

  if (body["channels"] !== undefined) {
    const chRes = await validateChannelIds(env.DB, body["channels"]);
    if (chRes.error) return jsonErr(400, "validation_failed", { details: [chRes.error] });
    const existing = await getChannelsForDomain(env.DB, fqdn);
    for (const ch of existing) {
      await unlinkChannel(env.DB, fqdn, ch.id);
    }
    for (const chId of chRes.channels!) {
      await linkChannel(env.DB, fqdn, chId);
    }
  }

  const updated = await updateDomain(env.DB, fqdn, patch);
  if (!updated) return jsonErr(404, "not_found");

  const finalDomain = newPhaseOffset !== undefined ? await getDomain(env.DB, fqdn) : updated;
  if (!finalDomain) return jsonErr(404, "not_found");
  return json({ ...finalDomain, notify_on: JSON.parse(finalDomain.notify_on) as unknown });
}

async function handleDeleteDomain(fqdn: string, env: Env): Promise<Response> {
  const deleted = await deleteDomain(env.DB, fqdn);
  if (!deleted) return jsonErr(404, "not_found");
  return json({ deleted: true });
}

async function handleGetChannels(env: Env): Promise<Response> {
  const channels = await listChannels(env.DB);
  return json(channels);
}

async function handlePostChannel(req: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "validation_failed", { details: ["body: invalid JSON"] });
  }

  const errors: string[] = [];

  let rawType = body["type"];
  let resolvedType: ChannelType | undefined;

  if (typeof rawType !== "string" || rawType.trim() === "") {
    errors.push("type: required string");
  } else {
    if (rawType === "webhook") {
      rawType = typeof body["target"] === "string"
        ? detectWebhookType(body["target"])
        : "webhook-generic";
    }
    if (!VALID_CHANNEL_TYPES.has(rawType as ChannelType)) {
      errors.push(`type: must be one of ${[...VALID_CHANNEL_TYPES].join(", ")}`);
    } else {
      resolvedType = rawType as ChannelType;
    }
  }

  const targetRaw = body["target"];
  if (typeof targetRaw !== "string" || targetRaw.trim() === "") {
    errors.push("target: required string");
  } else if (resolvedType !== undefined) {
    const target = targetRaw.trim();
    if (resolvedType === "email" && !EMAIL_RE.test(target)) {
      errors.push("target: invalid email address");
    } else if (resolvedType.startsWith("webhook")) {
      const allowlist = parseAllowlist(await getWebhookHostAllowlist(env, env.DB));
      const check = isWebhookAllowed(target, allowlist);
      if (!check.allowed) {
        errors.push(`target: webhook host not in allowlist (${check.reason ?? "not-allowed"})`);
      }
    }
  }

  if (errors.length > 0) return jsonErr(400, "validation_failed", { details: errors });

  const channel = await createChannel(env.DB, {
    id: crypto.randomUUID(),
    type: resolvedType!,
    target: (body["target"] as string).trim(),
    label: typeof body["label"] === "string" ? body["label"] : null,
    disabled: 0,
  });

  return json(channel, 201);
}

async function handlePatchChannel(id: string, req: Request, env: Env): Promise<Response> {
  const channel = await getChannel(env.DB, id);
  if (!channel) return jsonErr(404, "not_found");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "validation_failed", { details: ["body: invalid JSON"] });
  }

  const errors: string[] = [];
  const patch: Partial<{ disabled: number; target: string; label: string }> = {};

  if (body["disabled"] !== undefined) {
    if (typeof body["disabled"] !== "boolean") errors.push("disabled: must be boolean");
    else patch.disabled = body["disabled"] ? 1 : 0;
  }

  if (body["target"] !== undefined) {
    if (typeof body["target"] !== "string" || body["target"].trim() === "") {
      errors.push("target: must be non-empty string");
    } else {
      const newTarget = body["target"].trim();
      if (channel.type === "email" && !EMAIL_RE.test(newTarget)) {
        errors.push("target: invalid email address");
      } else if (channel.type.startsWith("webhook")) {
        const allowlist = parseAllowlist(await getWebhookHostAllowlist(env, env.DB));
        const check = isWebhookAllowed(newTarget, allowlist);
        if (!check.allowed) errors.push(`target: webhook host not in allowlist (${check.reason ?? "not-allowed"})`);
      }
      patch.target = newTarget;
    }
  }

  if (body["label"] !== undefined) {
    if (typeof body["label"] !== "string") errors.push("label: must be string");
    else patch.label = body["label"];
  }

  if (errors.length > 0) return jsonErr(400, "validation_failed", { details: errors });

  const updated = await updateChannel(env.DB, id, patch);
  if (!updated) return jsonErr(404, "not_found");
  return json(updated);
}

async function handleDeleteChannel(id: string, req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const result = await deleteChannel(env.DB, id, force);
  if (!result.deleted) {
    if (result.referencingDomains && result.referencingDomains.length > 0) {
      return jsonErr(409, "channel_in_use", { domains: result.referencingDomains });
    }
    return jsonErr(404, "not_found");
  }
  return json({ deleted: true });
}

async function handleCheckDomain(fqdn: string, env: Env): Promise<Response> {
  const domain = await getDomain(env.DB, fqdn);
  if (!domain) return jsonErr(404, "not_found");

  const result = await lookupDomain(fqdn, {
    bootstrapKV: env.BOOTSTRAP,
    fetchImpl: fetch,
    rdapBaseUrl: env.RDAP_BASE_URL,
  });

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`UPDATE domains SET last_checked_at = ? WHERE fqdn = ?`)
    .bind(now, fqdn)
    .run();

  return json(result);
}

async function handleGetBudget(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const simulate = url.searchParams.get("simulate");

  if (simulate) {
    const params = new URLSearchParams(simulate);
    const cadenceRaw = params.get("cadence");
    if (!cadenceRaw) return jsonErr(400, "validation_failed", { details: ["simulate: cadence required"] });
    const cadence = parseInt(cadenceRaw, 10);
    if (!Number.isFinite(cadence) || cadence < 1 || cadence > 1440) {
      return jsonErr(400, "validation_failed", { details: ["simulate: cadence must be integer [1..1440]"] });
    }
    const allDomains = await listDomains(env.DB, { includePaused: true });
    const existingInputs = allDomains.map((d) => ({
      cadenceMinutes: d.cadence_minutes,
      phaseOffsetMinutes: d.phase_offset_minutes,
      paused: d.paused !== 0,
      tldSupported: d.tld_supported !== 0,
    }));
    const activeForOffset = existingInputs
      .filter((d) => !d.paused && d.tldSupported)
      .map((d) => ({ cadenceMinutes: d.cadenceMinutes, phaseOffsetMinutes: d.phaseOffsetMinutes }));
    const offset = pickLeastLoadedOffset(activeForOffset, cadence);
    const simulated = [
      ...existingInputs,
      { cadenceMinutes: cadence, phaseOffsetMinutes: offset, paused: false, tldSupported: true },
    ];
    const report = computeBudget({ domains: simulated });
    return json(report);
  }

  const report = await buildBudgetSnapshot(env.DB);
  return json(report);
}

async function handleGetEvents(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const fqdn = url.searchParams.get("fqdn") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || 20, 200) : 20;
  const events = await listEvents(env.EVENTS, { fqdn, limit });
  return json(events);
}

// ---------------------------------------------------------------------------
// App config validation
// ---------------------------------------------------------------------------

const APP_ALERT_FROM_RE = /^[^@]+@[^@]+\.[^@]+$/;

function validateAlertFromAddress(value: string): { ok: true } | { ok: false; reason: string } {
  if (!APP_ALERT_FROM_RE.test(value)) return { ok: false, reason: "invalid_email" };
  return { ok: true };
}

function validateWebhookHostAllowlist(value: string): { ok: true } | { ok: false; reason: string } {
  const entries = value.split(",");
  for (const raw of entries) {
    const entry = raw.trim();
    if (entry === "") return { ok: false, reason: "empty_entry" };
    if (entry.includes("://")) return { ok: false, reason: "entry_must_not_contain_scheme" };
    if (/\s/.test(entry)) return { ok: false, reason: "entry_must_not_contain_whitespace" };
  }
  return { ok: true };
}

function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const url = new URL(req.url);
  return origin === url.origin;
}

// ---------------------------------------------------------------------------
// GET /config/app
// ---------------------------------------------------------------------------

async function handleGetAppConfig(env: Env, db: D1Database): Promise<Response> {
  const [alertFrom, allowlist] = await Promise.all([
    getAppConfig(db, "app.alert_from_address"),
    getAppConfig(db, "app.webhook_host_allowlist"),
  ]);
  return json({
    alert_from_address: alertFrom ?? null,
    webhook_host_allowlist: allowlist ?? null,
    defaults: {
      webhook_host_allowlist: "*.webhook.office.com,hooks.slack.com,discord.com,discordapp.com",
    },
  });
}

// ---------------------------------------------------------------------------
// PUT /config/app/alert_from_address
// ---------------------------------------------------------------------------

async function handlePutAlertFromAddress(
  req: Request,
  env: Env,
  db: D1Database,
  identity: AuthIdentity,
  ctx: ExecutionContext,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "validation_failed", { details: ["body: invalid JSON"] });
  }

  const rawValue = body["value"];
  if (typeof rawValue !== "string") {
    return jsonErr(400, "validation_failed", { details: ["value: must be string"] });
  }

  const trimmed = rawValue.trim();
  const oldRow = await getAppConfig(db, "app.alert_from_address");

  if (trimmed === "") {
    await deleteAppConfig(db, "app.alert_from_address");
    ctx.waitUntil(
      logAuthEvent(db, {
        email: identity.email,
        event_type: "config_updated",
        auth_method: identity.method,
        ip_address: req.headers.get("CF-Connecting-IP"),
        user_agent: req.headers.get("User-Agent"),
        metadata: JSON.stringify({
          key: "app.alert_from_address",
          old_value_set: oldRow !== null,
          new_value_set: false,
        }),
      }),
    );
    return json({ ok: true, value: null });
  }

  const validation = validateAlertFromAddress(trimmed);
  if (!validation.ok) {
    return jsonErr(400, "validation_failed", { reason: validation.reason });
  }

  await setAppConfig(db, "app.alert_from_address", trimmed, identity.email);
  ctx.waitUntil(
    logAuthEvent(db, {
      email: identity.email,
      event_type: "config_updated",
      auth_method: identity.method,
      ip_address: req.headers.get("CF-Connecting-IP"),
      user_agent: req.headers.get("User-Agent"),
      metadata: JSON.stringify({
        key: "app.alert_from_address",
        old_value_set: oldRow !== null,
        new_value_set: true,
      }),
    }),
  );
  return json({ ok: true, value: trimmed });
}

// ---------------------------------------------------------------------------
// PUT /config/app/webhook_host_allowlist
// ---------------------------------------------------------------------------

async function handlePutWebhookHostAllowlist(
  req: Request,
  env: Env,
  db: D1Database,
  identity: AuthIdentity,
  ctx: ExecutionContext,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "validation_failed", { details: ["body: invalid JSON"] });
  }

  const rawValue = body["value"];
  if (typeof rawValue !== "string") {
    return jsonErr(400, "validation_failed", { details: ["value: must be string"] });
  }

  const trimmed = rawValue.trim();
  const oldRow = await getAppConfig(db, "app.webhook_host_allowlist");

  if (trimmed === "") {
    await deleteAppConfig(db, "app.webhook_host_allowlist");
    ctx.waitUntil(
      logAuthEvent(db, {
        email: identity.email,
        event_type: "config_updated",
        auth_method: identity.method,
        ip_address: req.headers.get("CF-Connecting-IP"),
        user_agent: req.headers.get("User-Agent"),
        metadata: JSON.stringify({
          key: "app.webhook_host_allowlist",
          old_value_set: oldRow !== null,
          new_value_set: false,
        }),
      }),
    );
    return json({ ok: true, value: null });
  }

  const validation = validateWebhookHostAllowlist(trimmed);
  if (!validation.ok) {
    return jsonErr(400, "validation_failed", { reason: validation.reason });
  }

  await setAppConfig(db, "app.webhook_host_allowlist", trimmed, identity.email);
  ctx.waitUntil(
    logAuthEvent(db, {
      email: identity.email,
      event_type: "config_updated",
      auth_method: identity.method,
      ip_address: req.headers.get("CF-Connecting-IP"),
      user_agent: req.headers.get("User-Agent"),
      metadata: JSON.stringify({
        key: "app.webhook_host_allowlist",
        old_value_set: oldRow !== null,
        new_value_set: true,
      }),
    }),
  );
  return json({ ok: true, value: trimmed });
}

// ---------------------------------------------------------------------------
// Login page
// ---------------------------------------------------------------------------

async function handleGetLogin(env: Env, db: D1Database): Promise<Response> {
  const count = await userCount(db);
  const demoMode = env.DEMO_MODE === "1";
  const emptyAllowlist = count === 0;
  const bannerHtml = emptyAllowlist
    ? `<div class="banner banner-warning">No users configured yet. Use your ADMIN_TOKEN below to log in and add the first user.</div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Domain Drop Watcher &mdash; Sign in</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Barlow',Helvetica,system-ui,sans-serif;background:#f4f4f4;color:#414042;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
.card{background:#fff;border-radius:8px;padding:32px 28px;width:100%;max-width:380px;box-shadow:0 4px 24px rgba(0,0,0,.12)}
h1{font-size:20px;font-weight:700;color:#e42e1b;margin-bottom:4px}
.subtitle{font-size:13px;color:#888;margin-bottom:20px}
.banner{padding:12px 14px;border-radius:6px;font-size:13px;margin-bottom:16px;line-height:1.5}
.banner-warning{background:#fff3cd;border-left:4px solid #ffc107;color:#856404}
label{display:block;font-size:13px;font-weight:500;margin-bottom:4px;color:#414042}
input[type=email],input[type=text],input[type=password],textarea{width:100%;padding:9px 10px;border:1px solid #ddd;border-radius:4px;font-size:14px;font-family:inherit;color:#414042;background:#fff;margin-bottom:12px}
input:focus,textarea:focus{outline:none;border-color:#e42e1b;box-shadow:0 0 0 2px rgba(228,46,27,.15)}
.btn{display:block;width:100%;padding:10px 16px;border-radius:4px;font-size:14px;font-weight:500;cursor:pointer;border:none;font-family:inherit;text-align:center;margin-bottom:8px}
.btn:focus-visible{outline:2px solid #e42e1b;outline-offset:2px}
.btn-primary{background:#e42e1b;color:#fff}
.btn-primary:hover{background:#c4260f}
.btn-secondary{background:#fff;color:#414042;border:1px solid #ddd}
.btn-secondary:hover{background:#f4f4f4}
.divider{text-align:center;font-size:12px;color:#888;margin:12px 0;position:relative}
.divider::before,.divider::after{content:'';position:absolute;top:50%;width:44%;height:1px;background:#ddd}
.divider::before{left:0}.divider::after{right:0}
details{margin-top:12px}
summary{cursor:pointer;font-size:13px;color:#2980b9;list-style:none}
summary::-webkit-details-marker{display:none}
.details-body{margin-top:10px}
textarea{resize:vertical;min-height:72px;font-family:monospace;font-size:0.85rem}
#msg{font-size:13px;margin-top:8px;min-height:18px}
#msg.error{color:#e42e1b}
#msg.success{color:#27ae60}
</style>
</head>
<body>
<div class="card">
  <h1>Domain Drop Watcher</h1>
  <p class="subtitle">Sign in to your dashboard</p>
  ${bannerHtml}
  ${demoMode ? `
  <a href="/" class="btn btn-primary" style="display:block;text-decoration:none;margin-bottom:4px">Sign in as guest</a>
  <div class="divider">or</div>
  ` : ``}
  <form id="email-form">
    <label for="email">Email address</label>
    <input type="email" id="email" name="email" required autocomplete="email" placeholder="you@example.com">
    <button type="submit" class="btn btn-primary">Send me a sign-in code</button>
  </form>
  <form id="code-form" style="display:none">
    <label for="code">6-digit code</label>
    <input type="text" id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" placeholder="000000">
    <button type="submit" class="btn btn-primary">Verify code</button>
    <button type="button" class="btn btn-secondary" id="back-to-email-btn">Back</button>
  </form>
  <div class="divider" id="passkey-divider">or</div>
  <div id="passkey-section">
    <button type="button" class="btn btn-secondary" id="passkey-btn">Sign in with a passkey</button>
  </div>
  <details id="break-glass-details">
    <summary>Break-glass: admin token</summary>
    <div class="details-body">
      <form id="token-form">
        <label for="admin-token">ADMIN_TOKEN</label>
        <textarea id="admin-token" name="admin-token" rows="3"></textarea>
        <button type="submit" class="btn btn-secondary">Sign in with token</button>
      </form>
    </div>
  </details>
  <div id="msg" role="alert" aria-live="polite"></div>
</div>
<script src="/vendor/simplewebauthn-browser.js"></script>
<script>
let pendingEmail = '';
const DEMO = ${demoMode ? 'true' : 'false'};

function setMsg(text, type) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.className = type || '';
}

function demoGuard(e) {
  if (!DEMO) return false;
  e.preventDefault();
  setMsg('This is a demo — click "Sign in as guest" above to explore.', 'error');
  return true;
}

function on(id, evt, fn) { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }

on('email-form', 'submit', async (e) => {
  if (demoGuard(e)) return;
  e.preventDefault();
  pendingEmail = document.getElementById('email').value;
  const submitBtn = e.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  setMsg('');
  const r = await fetch('/login/email-code', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:pendingEmail})});
  submitBtn.disabled = false;
  if (r.status === 429) {
    const j = await r.json();
    setMsg('Too many attempts. ' + (j.message || 'Please wait before trying again.'), 'error');
  } else {
    document.getElementById('email-form').style.display='none';
    document.getElementById('code-form').style.display='block';
    setMsg('Check your email for a 6-digit code.', 'success');
    document.getElementById('code').focus();
  }
});

on('back-to-email-btn', 'click', () => {
  document.getElementById('code-form').style.display='none';
  document.getElementById('email-form').style.display='block';
  setMsg('');
});

on('code-form', 'submit', async (e) => {
  if (demoGuard(e)) return;
  e.preventDefault();
  const code = document.getElementById('code').value;
  const submitBtn = e.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  setMsg('');
  const r = await fetch('/login/verify-code', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:pendingEmail,code})});
  const j = await r.json();
  submitBtn.disabled = false;
  if (r.ok) { location.href = j.redirect || '/'; }
  else { setMsg('Invalid or expired code. Please try again.', 'error'); }
});

on('passkey-btn', 'click', async (e) => {
  if (demoGuard(e)) return;
  const btn = document.getElementById('passkey-btn');
  btn.disabled = true;
  btn.textContent = 'Waiting for passkey…';
  setMsg('');
  try {
    const challengeRes = await fetch('/login/passkey/challenge', {credentials:'same-origin'});
    if (!challengeRes.ok) { setMsg('Could not start passkey login. Try email code instead.', 'error'); return; }
    const options = await challengeRes.json();
    const assertionResp = await window.SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });
    const loginRes = await fetch('/login/passkey', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(assertionResp)});
    const loginBody = await loginRes.json();
    if (loginRes.ok) { location.href = loginBody.redirect || '/'; }
    else { setMsg('Passkey authentication failed. Try email code instead.', 'error'); }
  } catch(err) {
    if (err && err.name === 'NotAllowedError') {
      setMsg('Passkey cancelled or not available.', 'error');
    } else {
      setMsg('Passkey error: ' + String(err && err.message ? err.message : err), 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in with a passkey';
  }
});

on('token-form', 'submit', async (e) => {
  e.preventDefault();
  const token = document.getElementById('admin-token').value.trim();
  const emailEl = document.getElementById('bootstrap-email') || document.getElementById('breakglass-email');
  const email = emailEl ? emailEl.value.trim() : '';
  const submitBtn = e.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  setMsg('');
  const r = await fetch('/login/admin-token', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({token, email})});
  submitBtn.disabled = false;
  if (r.ok) {
    const j = await r.json();
    location.href = j.redirect || '/';
  } else if (r.status === 400) {
    setMsg('Email is required.', 'error');
  } else {
    setMsg('Invalid admin token.', 'error');
  }
});
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...AUTH_PAGE_HEADERS },
  });
}

// ---------------------------------------------------------------------------
// POST /login/email-code
// ---------------------------------------------------------------------------

async function handlePostLoginEmailCode(
  req: Request,
  env: Env,
  db: D1Database,
  ctx: ExecutionContext,
): Promise<Response> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const ua = req.headers.get("User-Agent") ?? null;
  const now = Math.floor(Date.now() / 1000);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "validation_failed", { details: ["body: invalid JSON"] });
  }

  const email = typeof body["email"] === "string" ? body["email"].trim() : "";
  if (!email) {
    return jsonErr(400, "validation_failed", { details: ["email: required"] });
  }

  const rateDecision = await checkSendCodeRate(db, email, ip, now);
  if (!rateDecision.allowed) {
    return new Response(
      JSON.stringify({ error: "rate_limited", message: "Too many attempts. Please wait before requesting another code." }),
      {
        status: 429,
        headers: {
          ...JSON_HEADERS,
          "Retry-After": String(rateDecision.retryAfterSec ?? 900),
        },
      },
    );
  }

  if (env.DEMO_MODE === "1") {
    const allowed = (env.DEMO_ADMIN_EMAIL || "").toLowerCase();
    const requested = email.toLowerCase();
    if (!allowed || requested !== allowed) {
      // Rate-limit token already consumed above — this 404 is not a free probe.
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });
    }
  }

  const result = await issueLoginCode(env, db, ctx, email);

  ctx.waitUntil(recordLoginAttempt(db, "email", email.toLowerCase(), "code_sent", now));
  ctx.waitUntil(recordLoginAttempt(db, "ip", ip, "code_sent", now));

  if (!result.codeSent) {
    ctx.waitUntil(
      logAuthEvent(db, {
        email: email.toLowerCase(),
        event_type: "login_fail",
        auth_method: "email-code",
        ip_address: ip,
        user_agent: ua,
        metadata: JSON.stringify({ reason: "unknown_email" }),
      }),
    );
  }

  return json(
    { ok: true, message: "If your email is registered, a 6-digit code is on its way." },
    202,
  );
}

// ---------------------------------------------------------------------------
// POST /login/verify-code
// ---------------------------------------------------------------------------

async function handlePostLoginVerifyCode(
  req: Request,
  env: Env,
  db: D1Database,
  ctx: ExecutionContext,
): Promise<Response> {
  const workerOrigin = new URL(req.url).origin;
  const reqOrigin = req.headers.get("Origin");

  if (!reqOrigin || reqOrigin !== workerOrigin) {
    return jsonErr(403, "forbidden", { message: "Origin header mismatch" });
  }

  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const ua = req.headers.get("User-Agent") ?? null;
  const now = Math.floor(Date.now() / 1000);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "validation_failed", { details: ["body: invalid JSON"] });
  }

  const email = typeof body["email"] === "string" ? body["email"].trim() : "";
  const code = typeof body["code"] === "string" ? body["code"].trim() : "";

  if (!email || !code) {
    return jsonErr(400, "validation_failed", { details: ["email and code are required"] });
  }

  const rateDecision = await checkVerifyCodeRate(db, email, now);
  if (!rateDecision.allowed) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      {
        status: 429,
        headers: { ...JSON_HEADERS, "Retry-After": String(rateDecision.retryAfterSec ?? 600) },
      },
    );
  }

  if (env.DEMO_MODE === "1") {
    const allowed = (env.DEMO_ADMIN_EMAIL || "").toLowerCase();
    const requested = email.toLowerCase();
    if (!allowed || requested !== allowed) {
      // Rate-limit token already consumed above — this 404 is not a free probe.
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });
    }
  }

  const redeemResult = await redeemLoginCode(env, db, email, code);

  if (!redeemResult.ok) {
    ctx.waitUntil(recordLoginAttempt(db, "email", email.toLowerCase(), "code_verify_fail", now));
    ctx.waitUntil(recordLoginAttempt(db, "ip", ip, "code_verify_fail", now));
    ctx.waitUntil(
      logAuthEvent(db, {
        email: email.toLowerCase(),
        event_type: "login_fail",
        auth_method: "email-code",
        ip_address: ip,
        user_agent: ua,
        metadata: JSON.stringify({ reason: redeemResult.reason }),
      }),
    );
    return jsonErr(401, "invalid_code");
  }

  const session = await createSession(env, db, {
    email: email.toLowerCase(),
    authMethod: "email-code",
    userAgent: ua,
    ipAddress: ip,
  });

  await recordUserLogin(db, email.toLowerCase(), now);

  ctx.waitUntil(recordLoginAttempt(db, "email", email.toLowerCase(), "code_verify_ok", now));
  ctx.waitUntil(recordLoginAttempt(db, "ip", ip, "code_verify_ok", now));
  ctx.waitUntil(
    logAuthEvent(db, {
      email: email.toLowerCase(),
      event_type: "login_ok",
      auth_method: "email-code",
      ip_address: ip,
      user_agent: ua,
    }),
  );

  return new Response(JSON.stringify({ ok: true, redirect: "/" }), {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      "Set-Cookie": serializeSessionCookie(session.cookieValue),
    },
  });
}

// ---------------------------------------------------------------------------
// POST /login/admin-token — break-glass: validate ADMIN_TOKEN, mint a session.
// Requires the operator to provide their email so the session and any later
// passkeys are bound to a real user from the start (rather than a sentinel).
// ---------------------------------------------------------------------------

async function handlePostLoginAdminToken(
  req: Request,
  env: Env,
  db: D1Database,
  ctx: ExecutionContext,
): Promise<Response> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const ua = req.headers.get("User-Agent") ?? null;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "validation_failed", { details: ["body: invalid JSON"] });
  }
  const provided = typeof body["token"] === "string" ? body["token"].trim() : "";
  const rawEmail = typeof body["email"] === "string" ? body["email"].trim() : "";
  const expected = resolveAdminToken(env);

  let email = rawEmail.toLowerCase();
  if (!email || !email.includes("@")) {
    const demoMode = env.DEMO_MODE === "1";
    const fallback = env.DEMO_ADMIN_EMAIL;
    if (demoMode && typeof fallback === "string" && fallback.includes("@")) {
      email = fallback.toLowerCase();
    } else {
      const count = await userCount(db);
      if (count <= 1) {
        const row = await db.prepare("SELECT email FROM users ORDER BY created_at ASC LIMIT 1").first<{email: string}>();
        if (row?.email) {
          email = row.email.toLowerCase();
        } else {
          return jsonErr(400, "validation_failed", { details: ["email: required (no users exist — use the bootstrap form)"] });
        }
      } else {
        return jsonErr(400, "validation_failed", { details: ["email: required when multiple users exist"] });
      }
    }
  }

  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    ctx.waitUntil(
      logAuthEvent(db, {
        email,
        event_type: "login_fail",
        auth_method: "bearer-break-glass",
        ip_address: ip,
        user_agent: ua,
        metadata: JSON.stringify({ reason: "invalid_admin_token" }),
      }),
    );
    return jsonErr(401, "invalid_admin_token");
  }

  const now = Math.floor(Date.now() / 1000);
  const userId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT OR IGNORE INTO users (email, user_id, added_at, disabled, role) VALUES (?, ?, ?, 0, 'admin')`,
    )
    .bind(email, userId, now)
    .run();

  const session = await createSession(env, db, {
    email,
    authMethod: "bearer-break-glass",
    userAgent: ua,
    ipAddress: ip,
  });

  ctx.waitUntil(
    logAuthEvent(db, {
      email,
      event_type: "login_ok",
      auth_method: "bearer-break-glass",
      ip_address: ip,
      user_agent: ua,
    }),
  );

  return new Response(JSON.stringify({ ok: true, redirect: "/" }), {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      "Set-Cookie": serializeSessionCookie(session.cookieValue),
    },
  });
}

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------

async function handlePostLogout(
  req: Request,
  env: Env,
  db: D1Database,
  identity: AuthIdentity,
  ctx: ExecutionContext,
): Promise<Response> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieMatch = /(?:^|;\s*)dropwatch_session=([^\s;]+)/.exec(cookieHeader);
  const rawCookieVal = cookieMatch?.[1] ?? "";
  const sessionId = rawCookieVal.split(".")[0] ?? "";

  if (sessionId) {
    await revokeSession(db, sessionId);
  }

  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const ua = req.headers.get("User-Agent") ?? null;
  ctx.waitUntil(
    logAuthEvent(db, {
      email: identity.email,
      event_type: "logout",
      auth_method: identity.method,
      ip_address: ip,
      user_agent: ua,
    }),
  );

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...JSON_HEADERS, "Set-Cookie": clearSessionCookie() },
  });
}

// ---------------------------------------------------------------------------
// User management routes
// ---------------------------------------------------------------------------

async function handleGetUsers(env: Env, db: D1Database): Promise<Response> {
  const users = await listUsers(db);
  const now = Math.floor(Date.now() / 1000);
  const usersWithSessions = await Promise.all(
    users.map(async (u) => {
      const sessionRow = await db
        .prepare("SELECT COUNT(*) AS cnt FROM sessions WHERE email = ? AND expires_at > ?")
        .bind(u.email, now)
        .first<{ cnt: number }>();
      return { ...u, activeSessions: sessionRow?.cnt ?? 0 };
    }),
  );
  return json(usersWithSessions);
}

async function handlePostUser(
  req: Request,
  env: Env,
  db: D1Database,
  identity: AuthIdentity,
  ctx: ExecutionContext,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "validation_failed", { details: ["body: invalid JSON"] });
  }

  const email = typeof body["email"] === "string" ? body["email"].trim() : "";
  if (!email || !BASIC_EMAIL_RE.test(email)) {
    return jsonErr(400, "validation_failed", { details: ["email: required and must contain @"] });
  }

  const now = Math.floor(Date.now() / 1000);
  try {
    const user = await addUser(db, email, now);
    const actor = identity.email ?? "bearer";
    ctx.waitUntil(
      logAuthEvent(db, {
        email: user.email,
        event_type: "user_added",
        ip_address: req.headers.get("CF-Connecting-IP"),
        user_agent: req.headers.get("User-Agent"),
        metadata: JSON.stringify({ actor }),
      }),
    );
    return json(user, 201);
  } catch (e) {
    if (e instanceof UserExistsError) {
      return jsonErr(409, "user_exists");
    }
    throw e;
  }
}

async function handleDeleteUser(
  targetEmail: string,
  req: Request,
  db: D1Database,
  identity: AuthIdentity,
  ctx: ExecutionContext,
): Promise<Response> {
  const deleted = await removeUser(db, targetEmail);
  if (!deleted) return jsonErr(404, "not_found");

  const actor = identity.email ?? "bearer";
  ctx.waitUntil(
    logAuthEvent(db, {
      email: targetEmail.toLowerCase(),
      event_type: "user_removed",
      ip_address: req.headers.get("CF-Connecting-IP"),
      user_agent: req.headers.get("User-Agent"),
      metadata: JSON.stringify({ actor }),
    }),
  );
  return json({ deleted: true });
}

async function handleUserDisable(
  targetEmail: string,
  disabled: boolean,
  req: Request,
  db: D1Database,
  ctx: ExecutionContext,
): Promise<Response> {
  const ok = await setUserDisabled(db, targetEmail, disabled);
  if (!ok) return jsonErr(404, "not_found");

  ctx.waitUntil(
    logAuthEvent(db, {
      email: targetEmail.toLowerCase(),
      event_type: disabled ? "user_disabled" : "user_enabled",
      ip_address: req.headers.get("CF-Connecting-IP"),
      user_agent: req.headers.get("User-Agent"),
    }),
  );
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Session management routes
// ---------------------------------------------------------------------------

async function handleGetSessions(
  db: D1Database,
  identity: AuthIdentity,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const email = identity.email;
  if (!email) return jsonErr(403, "forbidden");

  const rows = await db
    .prepare(
      `SELECT session_id, email, created_at, expires_at, user_agent, ip_address, auth_method
       FROM sessions WHERE email = ? AND expires_at > ? ORDER BY created_at DESC`,
    )
    .bind(email, now)
    .all<{
      session_id: string;
      email: string;
      created_at: number;
      expires_at: number;
      user_agent: string | null;
      ip_address: string | null;
      auth_method: string;
    }>();

  return json(rows.results);
}

async function handleDeleteSession(
  sessionId: string,
  req: Request,
  db: D1Database,
  identity: AuthIdentity,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!identity.email) return jsonErr(403, "forbidden");
  await revokeSession(db, sessionId);
  ctx.waitUntil(
    logAuthEvent(db, {
      email: identity.email,
      event_type: "session_revoked",
      ip_address: req.headers.get("CF-Connecting-IP"),
      user_agent: req.headers.get("User-Agent"),
      metadata: JSON.stringify({ session_id: sessionId }),
    }),
  );
  return json({ ok: true });
}

async function handleRevokeAllSessions(
  req: Request,
  db: D1Database,
  identity: AuthIdentity,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!identity.email) return jsonErr(403, "forbidden");

  await db
    .prepare("DELETE FROM sessions WHERE email = ?")
    .bind(identity.email)
    .run();

  ctx.waitUntil(
    logAuthEvent(db, {
      email: identity.email,
      event_type: "session_revoked",
      ip_address: req.headers.get("CF-Connecting-IP"),
      user_agent: req.headers.get("User-Agent"),
      metadata: JSON.stringify({ scope: "all" }),
    }),
  );

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...JSON_HEADERS, "Set-Cookie": clearSessionCookie() },
  });
}

async function handleRevokeUserAllSessions(
  targetEmail: string,
  req: Request,
  db: D1Database,
  identity: AuthIdentity,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!identity.email) return jsonErr(403, "forbidden");

  await db
    .prepare("DELETE FROM sessions WHERE email = ?")
    .bind(targetEmail.toLowerCase())
    .run();

  ctx.waitUntil(
    logAuthEvent(db, {
      email: identity.email,
      event_type: "session_revoked",
      ip_address: req.headers.get("CF-Connecting-IP"),
      user_agent: req.headers.get("User-Agent"),
      metadata: JSON.stringify({ scope: "all", target_email: targetEmail.toLowerCase() }),
    }),
  );

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Passkey routes
// ---------------------------------------------------------------------------

function randomBase64url(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function handlePasskeyRegisterBegin(
  req: Request,
  env: Env,
  db: D1Database,
  identity: AuthIdentity,
): Promise<Response> {
  if (!identity.email) return jsonErr(403, "forbidden");

  const now = Math.floor(Date.now() / 1000);
  const user = await db
    .prepare("SELECT email, user_id, added_at, last_login_at, disabled, role FROM users WHERE email = ?")
    .bind(identity.email)
    .first<{ email: string; user_id: string; added_at: number; last_login_at: number | null; disabled: number; role: string }>();

  if (!user) return jsonErr(404, "not_found");

  const challengeId = randomBase64url(32);

  const options = await beginPasskeyRegistration(env, db, {
    user: {
      email: user.email,
      userId: user.user_id,
      addedAt: user.added_at,
      lastLoginAt: user.last_login_at,
      disabled: user.disabled !== 0,
      role: user.role,
    },
    requestUrl: req.url,
    challengeId,
    now,
  });

  const challengeCookie = `dropwatch_pk_challenge=${challengeId}; HttpOnly; Secure; SameSite=Lax; Path=/passkeys; Max-Age=300`;

  return new Response(JSON.stringify(options), {
    status: 200,
    headers: { ...JSON_HEADERS, "Set-Cookie": challengeCookie },
  });
}

async function handlePasskeyRegisterFinish(
  req: Request,
  env: Env,
  db: D1Database,
  identity: AuthIdentity,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!identity.email) return jsonErr(403, "forbidden");

  const workerOrigin = new URL(req.url).origin;
  const reqOrigin = req.headers.get("Origin");
  if (!reqOrigin || reqOrigin !== workerOrigin) {
    return jsonErr(403, "forbidden", { message: "Origin header mismatch" });
  }

  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieMatch = /(?:^|;\s*)dropwatch_pk_challenge=([^\s;]+)/.exec(cookieHeader);
  const challengeId = cookieMatch?.[1] ?? "";

  const clearChallengeCookie = "dropwatch_pk_challenge=; HttpOnly; Secure; SameSite=Lax; Path=/passkeys; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";

  if (!challengeId) {
    return new Response(JSON.stringify({ ok: false, reason: "no_challenge" }), {
      status: 400,
      headers: { ...JSON_HEADERS, "Set-Cookie": clearChallengeCookie },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: "invalid_body" }), {
      status: 400,
      headers: { ...JSON_HEADERS, "Set-Cookie": clearChallengeCookie },
    });
  }

  const userRow = await db
    .prepare("SELECT email, user_id, added_at, last_login_at, disabled, role FROM users WHERE email = ?")
    .bind(identity.email)
    .first<{ email: string; user_id: string; added_at: number; last_login_at: number | null; disabled: number; role: string }>();

  if (!userRow) {
    return new Response(JSON.stringify({ ok: false, reason: "not_found" }), {
      status: 404,
      headers: { ...JSON_HEADERS, "Set-Cookie": clearChallengeCookie },
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const bodyObj = body as Record<string, unknown>;
  const deviceName = typeof bodyObj["deviceName"] === "string" ? bodyObj["deviceName"] : null;

  const result = await finishPasskeyRegistration(env, db, {
    user: {
      email: userRow.email,
      userId: userRow.user_id,
      addedAt: userRow.added_at,
      lastLoginAt: userRow.last_login_at,
      disabled: userRow.disabled !== 0,
      role: userRow.role,
    },
    requestUrl: req.url,
    challengeId,
    attestationResponse: body as Parameters<typeof finishPasskeyRegistration>[2]["attestationResponse"],
    deviceName,
    now,
  });

  if (result.ok) {
    ctx.waitUntil(
      logAuthEvent(db, {
        email: identity.email,
        event_type: "passkey_enrolled",
        auth_method: "passkey",
        ip_address: req.headers.get("CF-Connecting-IP"),
        user_agent: req.headers.get("User-Agent"),
        metadata: JSON.stringify({ device_name: deviceName }),
      }),
    );
    return new Response(JSON.stringify({ ok: true, credentialId: result.credentialId }), {
      status: 200,
      headers: { ...JSON_HEADERS, "Set-Cookie": clearChallengeCookie },
    });
  }

  return new Response(JSON.stringify({ ok: false, reason: result.reason }), {
    status: 400,
    headers: { ...JSON_HEADERS, "Set-Cookie": clearChallengeCookie },
  });
}

async function handleGetPasskeys(
  db: D1Database,
  identity: AuthIdentity,
): Promise<Response> {
  if (!identity.email) return jsonErr(403, "forbidden");

  const passkeys = await listPasskeysForUser(db, identity.email);
  const sanitized = passkeys.map((p) => ({
    credentialId: p.credentialId,
    deviceName: p.deviceName,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt,
    transports: p.transports,
  }));
  return json(sanitized);
}

async function handleDeletePasskey(
  credentialId: string,
  req: Request,
  db: D1Database,
  identity: AuthIdentity,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!identity.email) return jsonErr(403, "forbidden");

  const deleted = await removePasskey(db, credentialId, identity.email);
  if (!deleted) return jsonErr(404, "not_found");

  ctx.waitUntil(
    logAuthEvent(db, {
      email: identity.email,
      event_type: "passkey_removed",
      auth_method: null,
      ip_address: req.headers.get("CF-Connecting-IP"),
      user_agent: req.headers.get("User-Agent"),
      metadata: JSON.stringify({ credential_id: credentialId }),
    }),
  );
  return json({ deleted: true });
}

async function handlePasskeyLoginChallenge(
  req: Request,
  env: Env,
  db: D1Database,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const tempId = randomBase64url(32);

  const options = await beginPasskeyLogin(env, db, {
    requestUrl: req.url,
    tempId,
    now,
  });

  const tempCookie = `dropwatch_pk_tempid=${tempId}; HttpOnly; Secure; SameSite=Lax; Path=/login; Max-Age=300`;

  return new Response(JSON.stringify(options), {
    status: 200,
    headers: { ...JSON_HEADERS, "Set-Cookie": tempCookie },
  });
}

async function handlePasskeyLogin(
  req: Request,
  env: Env,
  db: D1Database,
  ctx: ExecutionContext,
): Promise<Response> {
  const workerOrigin = new URL(req.url).origin;
  const reqOrigin = req.headers.get("Origin");
  if (!reqOrigin || reqOrigin !== workerOrigin) {
    return jsonErr(403, "forbidden", { message: "Origin header mismatch" });
  }

  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieMatch = /(?:^|;\s*)dropwatch_pk_tempid=([^\s;]+)/.exec(cookieHeader);
  const tempId = cookieMatch?.[1] ?? "";

  if (!tempId) return jsonErr(400, "no_challenge");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr(400, "invalid_body");
  }

  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const ua = req.headers.get("User-Agent") ?? null;
  const now = Math.floor(Date.now() / 1000);

  const result = await finishPasskeyLogin(env, db, {
    requestUrl: req.url,
    tempId,
    assertionResponse: body as Parameters<typeof finishPasskeyLogin>[2]["assertionResponse"],
    now,
  });

  if (result.ok) {
    const session = await createSession(env, db, {
      email: result.user.email,
      authMethod: "passkey",
      userAgent: ua,
      ipAddress: ip,
    });

    await recordUserLogin(db, result.user.email, now);

    ctx.waitUntil(recordLoginAttempt(db, "email", result.user.email, "passkey_ok", now));
    ctx.waitUntil(recordLoginAttempt(db, "ip", ip, "passkey_ok", now));
    ctx.waitUntil(
      logAuthEvent(db, {
        email: result.user.email,
        event_type: "login_ok",
        auth_method: "passkey",
        ip_address: ip,
        user_agent: ua,
      }),
    );

    return new Response(JSON.stringify({ ok: true, redirect: "/" }), {
      status: 200,
      headers: { ...JSON_HEADERS, "Set-Cookie": serializeSessionCookie(session.cookieValue) },
    });
  }

  ctx.waitUntil(recordLoginAttempt(db, "email", "unknown", "passkey_fail", now));
  ctx.waitUntil(recordLoginAttempt(db, "ip", ip, "passkey_fail", now));
  ctx.waitUntil(
    logAuthEvent(db, {
      email: null,
      event_type: "login_fail",
      auth_method: "passkey",
      ip_address: ip,
      user_agent: ua,
      metadata: JSON.stringify({ reason: result.reason }),
    }),
  );

  return jsonErr(401, "passkey_auth_failed", { reason: result.reason });
}

// ---------------------------------------------------------------------------
// GET /auth/health (bearer-only)
// ---------------------------------------------------------------------------

async function handleAuthHealth(env: Env, db: D1Database): Promise<Response> {
  const count = await userCount(db);
  return json({
    email_routing_bound: env.EMAIL !== undefined,
    alert_from_set: !!(await getAlertFromAddress(env, db)),
    session_secret_set: !!env.SESSION_SECRET,
    admin_token_set: !!resolveAdminToken(env),
    allowlist_size: count,
    rp_id: env.WEBAUTHN_RP_ID ?? null,
    webauthn_available: true,
  });
}

// ---------------------------------------------------------------------------
// Main request handler
// ---------------------------------------------------------------------------
// Demo guest mode — hardcoded sample data for unauthenticated visitors
// ---------------------------------------------------------------------------

function agoUnix(ms: number): number { return Math.floor((Date.now() - ms) / 1000); }

function buildDemoDomains() {
  return [
    { fqdn: "checkout.example.com", label: "Primary storefront", cadence_minutes: 15, last_status: "registered", last_checked_at: agoUnix(180_000), paused: false, channel_ids: ["ch-email-1", "ch-webhook-1"] },
    { fqdn: "api.acmecorp.io", label: "", cadence_minutes: 60, last_status: "registered", last_checked_at: agoUnix(3_600_000), paused: false, channel_ids: ["ch-webhook-1"] },
    { fqdn: "legacy-portal.net", label: "Sunset Q3", cadence_minutes: 1440, last_status: "dropping", last_checked_at: agoUnix(7_200_000), paused: false, channel_ids: ["ch-email-1"] },
    { fqdn: "brand-typo-squat.com", label: "Defensive registration", cadence_minutes: 360, last_status: "available", last_checked_at: agoUnix(900_000), paused: true, channel_ids: [] },
  ];
}

function buildDemoChannels() {
  return [
    { id: "ch-email-1", type: "email", target: "alerts@example.com", label: "Ops Team", disabled: false, last_delivery_result: "ok", last_delivery_at: agoUnix(86_400_000) },
    { id: "ch-webhook-1", type: "webhook", target: "https://hooks.slack.example.com/services/T00/B00/xxxx", label: "Slack #domains", disabled: false, last_delivery_result: "ok", last_delivery_at: agoUnix(43_200_000) },
  ];
}

function buildDemoEvents() {
  return [
    { ts: agoUnix(900_000), kind: "status_change", fqdn: "brand-typo-squat.com", data: { from: "registered", to: "available" } },
    { ts: agoUnix(3_600_000), kind: "alert_sent", fqdn: "brand-typo-squat.com", data: { channel: "email", target: "alerts@example.com" } },
    { ts: agoUnix(7_200_000), kind: "status_change", fqdn: "legacy-portal.net", data: { from: "registered", to: "dropping" } },
    { ts: agoUnix(86_400_000), kind: "check", fqdn: "checkout.example.com", data: { status: "registered" } },
    { ts: agoUnix(86_400_000), kind: "check", fqdn: "api.acmecorp.io", data: { status: "registered" } },
  ];
}

function handleDemoGuest(pathname: string, _url: URL): Response {
  if (pathname === "/domains") return json(buildDemoDomains());
  if (pathname === "/channels") return json(buildDemoChannels());
  if (pathname === "/events") return json(buildDemoEvents());
  if (pathname === "/budget") return json({ peakDuePerMinute: 4, d1WritesPerDay: 287, headroom: 41, withinFreeTier: true, warnings: [] });
  if (pathname === "/config/app") return json({ alert_from_address: "noreply@example.com", webhook_host_allowlist: ["hooks.slack.example.com"] });
  if (pathname === "/users") return json([
    { email: "admin@example.com", added_at: agoUnix(604_800_000), last_login_at: agoUnix(3_600_000), disabled: false, role: "admin" },
    { email: "ops@example.com", added_at: agoUnix(259_200_000), last_login_at: agoUnix(86_400_000), disabled: false, role: "admin" },
  ]);
  if (pathname === "/sessions") return json([]);
  if (pathname === "/passkeys") return json([]);
  if (pathname === "/auth/health") return json({ session: "guest", method: "demo-guest" });
  const domainMatch = /^\/domains\/([^/]+)$/.exec(pathname);
  if (domainMatch) {
    const fqdn = decodeURIComponent(domainMatch[1] ?? "").toLowerCase();
    const d = buildDemoDomains().find(x => x.fqdn === fqdn);
    if (d) return json(d);
  }
  return jsonErr(404, "not_found");
}

// ---------------------------------------------------------------------------

export async function handleAdmin(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  if (pathname === "/health" && method === "GET") {
    return json({ ok: true, version: env.VERSION ?? "0.1.0" });
  }

  if ((pathname === "/" || pathname === "/index.html") && method === "GET") {
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(req);
      const res = new Response(assetRes.body, {
        status: assetRes.status,
        headers: assetRes.headers,
      });
      res.headers.set("Content-Security-Policy", DASHBOARD_CSP);
      res.headers.set("X-Content-Type-Options", "nosniff");
      res.headers.set("Referrer-Policy", "no-referrer");
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
    return new Response(
      "domain-drop-watcher admin — deploy with wrangler assets configured",
      { status: 200, headers: SECURITY_HEADERS },
    );
  }

  // Pass /vendor/* and other static assets through to the ASSETS binding.
  // run_worker_first: true intercepts ALL requests before CF serves static files,
  // so any path not explicitly handled above must be forwarded here.
  if (pathname.startsWith("/vendor/") && method === "GET") {
    if (env.ASSETS) {
      return env.ASSETS.fetch(req);
    }
    return jsonErr(404, "not_found");
  }

  if (pathname === "/login" && method === "GET") {
    return handleGetLogin(env, env.DB);
  }

  if (pathname === "/auth/empty-allowlist-status" && method === "GET") {
    const count = await userCount(env.DB);
    return json({ empty: count === 0 });
  }

  const loginIp = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const skipRateLimit = env.EMAIL_STUB === "1";

  if (pathname === "/login/email-code" && method === "POST") {
    if (!skipRateLimit && !await checkRateLimit(env.BOOTSTRAP, loginIp, "email-code", 5, 900)) return jsonErr(429, "too_many_requests");
    return handlePostLoginEmailCode(req, env, env.DB, ctx);
  }

  if (pathname === "/login/verify-code" && method === "POST") {
    if (!skipRateLimit && !await checkRateLimit(env.BOOTSTRAP, loginIp, "verify-code", 10, 900)) return jsonErr(429, "too_many_requests");
    return handlePostLoginVerifyCode(req, env, env.DB, ctx);
  }

  if (pathname === "/login/passkey/challenge" && method === "GET") {
    return handlePasskeyLoginChallenge(req, env, env.DB);
  }

  if (pathname === "/login/passkey" && method === "POST") {
    if (!skipRateLimit && !await checkRateLimit(env.BOOTSTRAP, loginIp, "passkey", 10, 900)) return jsonErr(429, "too_many_requests");
    return handlePasskeyLogin(req, env, env.DB, ctx);
  }

  if (pathname === "/login/admin-token" && method === "POST") {
    if (!skipRateLimit && !await checkRateLimit(env.BOOTSTRAP, loginIp, "admin-token", 5, 900)) return jsonErr(429, "too_many_requests");
    return handlePostLoginAdminToken(req, env, env.DB, ctx);
  }

  if (pathname === "/api/demo-mode" && method === "GET") {
    return new Response(
      JSON.stringify({ demo: env.DEMO_MODE === "1" }),
      { headers: { "content-type": "application/json" } },
    );
  }

  // ---------------------------------------------------------------------------
  // Test-only endpoints — only reachable when EMAIL_STUB === "1"
  // These must never be reachable in production.
  // ---------------------------------------------------------------------------

  if (env.EMAIL_STUB === "1" && pathname === "/api/test/peek-code" && method === "GET") {
    const email = url.searchParams.get("email");
    if (!email) return jsonErr(400, "email_required");
    const code = await env.BOOTSTRAP.get(`stub-code:${email.toLowerCase()}`);
    return new Response(JSON.stringify({ code }), { headers: { "content-type": "application/json" } });
  }

  if (env.EMAIL_STUB === "1" && pathname === "/api/test/seed-user" && method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonErr(400, "invalid_json");
    }
    const email = typeof body["email"] === "string" ? body["email"].trim().toLowerCase() : "";
    if (!email) return jsonErr(400, "email_required");
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (email, user_id, added_at, last_login_at, disabled, role) VALUES (?, ?, ?, NULL, 0, ?)",
    ).bind(email, crypto.randomUUID(), now, "admin").run();
    return new Response(JSON.stringify({ ok: true, email }), { headers: { "content-type": "application/json" } });
  }

  if (env.EMAIL_STUB === "1" && pathname === "/api/test/run-cron" && method === "POST") {
    const { runScheduledTick } = await import("./tick.js");
    await runScheduledTick(env);
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  }

  const identity = await authenticate(req, env, env.DB);
  const demoMode = env.DEMO_MODE === "1";

  const DEMO_GUEST_PATHS = new Set([
    "/domains", "/channels", "/events", "/budget", "/config/app",
    "/users", "/sessions", "/passkeys", "/auth/health",
  ]);

  if (!identity && demoMode && method === "GET") {
    if (DEMO_GUEST_PATHS.has(pathname) || /^\/domains\/[^/]+$/.test(pathname)) {
      return handleDemoGuest(pathname, url);
    }
    return jsonErr(404, "not_found");
  }

  if (!identity) {
    return jsonErr(401, "unauthorized");
  }

  const isStateChanging = method !== "GET" && method !== "HEAD";
  if (identity.method !== "bearer-break-glass" && isStateChanging && !checkOrigin(req)) {
    return jsonErr(403, "forbidden");
  }

  if (identity.method === "bearer-break-glass" && method === "POST") {
    ctx.waitUntil(
      logAuthEvent(env.DB, {
        email: null,
        event_type: "bearer_break_glass",
        auth_method: "bearer-break-glass",
        ip_address: req.headers.get("CF-Connecting-IP"),
        user_agent: req.headers.get("User-Agent"),
        metadata: JSON.stringify({ path: pathname }),
      }),
    );
  }

  if (pathname === "/auth/health" && method === "GET") {
    if (identity.method !== "bearer-break-glass") return jsonErr(403, "forbidden");
    return handleAuthHealth(env, env.DB);
  }

  if (pathname === "/logout" && method === "POST") {
    return handlePostLogout(req, env, env.DB, identity, ctx);
  }

  if (pathname === "/users" && method === "GET") {
    return handleGetUsers(env, env.DB);
  }
  if (pathname === "/users" && method === "POST") {
    return handlePostUser(req, env, env.DB, identity, ctx);
  }

  const userMatch = /^\/users\/([^/]+)$/.exec(pathname);
  if (userMatch) {
    const userEmail = decodeURIComponent(userMatch[1] ?? "");
    if (method === "DELETE") return handleDeleteUser(userEmail, req, env.DB, identity, ctx);
  }

  const userActionMatch = /^\/users\/([^/]+)\/(disable|enable)$/.exec(pathname);
  if (userActionMatch && method === "POST") {
    const userEmail = decodeURIComponent(userActionMatch[1] ?? "");
    const action = userActionMatch[2]!;
    return handleUserDisable(userEmail, action === "disable", req, env.DB, ctx);
  }

  const userSessionsMatch = /^\/users\/([^/]+)\/sessions\/revoke-all$/.exec(pathname);
  if (userSessionsMatch && method === "POST") {
    const targetEmail = decodeURIComponent(userSessionsMatch[1] ?? "");
    return handleRevokeUserAllSessions(targetEmail, req, env.DB, identity, ctx);
  }

  if (pathname === "/sessions" && method === "GET") {
    return handleGetSessions(env.DB, identity);
  }
  if (pathname === "/sessions/revoke-all" && method === "POST") {
    return handleRevokeAllSessions(req, env.DB, identity, ctx);
  }

  const sessionDeleteMatch = /^\/sessions\/([^/]+)$/.exec(pathname);
  if (sessionDeleteMatch && method === "DELETE") {
    const sessionId = decodeURIComponent(sessionDeleteMatch[1] ?? "");
    return handleDeleteSession(sessionId, req, env.DB, identity, ctx);
  }

  if (pathname === "/passkeys/register/begin" && method === "POST") {
    return handlePasskeyRegisterBegin(req, env, env.DB, identity);
  }
  if (pathname === "/passkeys/register/finish" && method === "POST") {
    return handlePasskeyRegisterFinish(req, env, env.DB, identity, ctx);
  }
  if (pathname === "/passkeys" && method === "GET") {
    return handleGetPasskeys(env.DB, identity);
  }

  const passkeyDeleteMatch = /^\/passkeys\/([^/]+)$/.exec(pathname);
  if (passkeyDeleteMatch && method === "DELETE") {
    const credentialId = decodeURIComponent(passkeyDeleteMatch[1] ?? "");
    return handleDeletePasskey(credentialId, req, env.DB, identity, ctx);
  }

  if (pathname === "/domains" && method === "GET") return handleGetDomains(env);
  if (pathname === "/domains" && method === "POST") return handlePostDomain(req, env);
  if (pathname === "/domains/bulk" && method === "POST") return handlePostDomainsBulk(req, env);
  if (pathname === "/domains/pause-all" && method === "POST") {
    await setConfig(env.DB, "global_paused", "1");
    return json({ ok: true });
  }
  if (pathname === "/domains/resume-all" && method === "POST") {
    await setConfig(env.DB, "global_paused", "0");
    return json({ ok: true });
  }

  const domainMatch = /^\/domains\/([^/]+)$/.exec(pathname);
  if (domainMatch) {
    const fqdn = decodeURIComponent(domainMatch[1] ?? "").toLowerCase();
    if (method === "GET") return handleGetDomain(fqdn, env);
    if (method === "PATCH") return handlePatchDomain(fqdn, req, env);
    if (method === "DELETE") return handleDeleteDomain(fqdn, env);
  }

  if (pathname === "/channels" && method === "GET") return handleGetChannels(env);
  if (pathname === "/channels" && method === "POST") return handlePostChannel(req, env);

  const channelMatch = /^\/channels\/([^/]+)$/.exec(pathname);
  if (channelMatch) {
    const id = decodeURIComponent(channelMatch[1] ?? "");
    if (method === "PATCH") return handlePatchChannel(id, req, env);
    if (method === "DELETE") return handleDeleteChannel(id, req, env);
  }

  const checkMatch = /^\/check\/([^/]+)$/.exec(pathname);
  if (checkMatch && method === "POST") {
    const fqdn = decodeURIComponent(checkMatch[1] ?? "").toLowerCase();
    return handleCheckDomain(fqdn, env);
  }

  if (pathname === "/budget" && method === "GET") return handleGetBudget(req, env);
  if (pathname === "/events" && method === "GET") return handleGetEvents(req, env);

  if (pathname === "/config/app" && method === "GET") {
    return handleGetAppConfig(env, env.DB);
  }
  if (pathname === "/config/app/alert_from_address" && method === "PUT") {
    return handlePutAlertFromAddress(req, env, env.DB, identity, ctx);
  }
  if (pathname === "/config/app/webhook_host_allowlist" && method === "PUT") {
    return handlePutWebhookHostAllowlist(req, env, env.DB, identity, ctx);
  }

  return jsonErr(404, "not_found");
}

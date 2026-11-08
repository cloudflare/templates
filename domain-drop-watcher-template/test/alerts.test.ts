import { describe, it, expect, vi } from "vitest";
import {
  detectWebhookType,
  formatTeamsCard,
  formatNativeEmail,
  formatSlackBlocks,
  formatDiscordEmbed,
  dispatchAlert,
} from "../src/alerts.js";
import type { ChannelRow, DomainRow, AlertTransition, Env } from "../src/types.js";
import type { D1Database } from "@cloudflare/workers-types";

// Minimal D1 stub — only recordChannelDelivery path is exercised in alerts.ts
function makeNoopD1(): D1Database {
  const stmt = {
    bind: (..._args: unknown[]) => stmt,
    run: () => Promise.resolve({ success: true, meta: { changes: 0, last_row_id: 0, duration: 0, rows_read: 0, rows_written: 0, size_after: 0, changed_db: false }, results: [] }),
    first: () => Promise.resolve(null),
    all: () => Promise.resolve({ success: true, meta: { changes: 0, last_row_id: 0, duration: 0, rows_read: 0, rows_written: 0, size_after: 0, changed_db: false }, results: [] }),
    raw: () => Promise.resolve([]),
  };
  return {
    prepare: (_sql: string) => stmt as unknown as ReturnType<D1Database["prepare"]>,
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    batch: () => Promise.resolve([]),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function makeEnv(overrides?: Partial<Env>): Env {
  return {
    DB: makeNoopD1(),
    EVENTS: {} as never,
    BOOTSTRAP: {} as never,
    ADMIN_TOKEN: "test-token",
    SESSION_SECRET: "test-session-secret-placeholder-for-unit-tests",
    WEBHOOK_HOST_ALLOWLIST:
      "webhook.office.com,*.webhook.office.com,hooks.slack.com,discord.com",
    ...overrides,
  };
}

function makeDomain(overrides?: Partial<DomainRow>): DomainRow {
  return {
    fqdn: "example.com",
    added_at: 1700000000,
    cadence_minutes: 60,
    phase_offset_minutes: 0,
    next_due_at: 1700003600,
    paused: 0,
    last_status: "registered",
    last_status_changed_at: null,
    last_checked_at: null,
    pending_confirm_status: null,
    pending_confirm_count: null,
    notify_on: "dropping,available",
    label: "Test Domain",
    tld_supported: 1,
    ...overrides,
  };
}

function makeTransition(overrides?: Partial<AlertTransition>): AlertTransition {
  return {
    fqdn: "example.com",
    oldStatus: "registered",
    newStatus: "available",
    detectedAt: 1700000000000,
    ...overrides,
  };
}

function makeChannel(overrides?: Partial<ChannelRow>): ChannelRow {
  return {
    id: "ch-1",
    type: "webhook-teams",
    target: "https://webhook.office.com/webhookb2/test",
    label: "Test Channel",
    disabled: 0,
    last_delivery_result: null,
    last_delivery_at: null,
    ...overrides,
  };
}

function makeFetch(status: number): typeof fetch {
  return (_url: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify({ id: "ok" }), { status }));
}

describe("detectWebhookType", () => {
  it("identifies Teams by webhook.office.com host", () => {
    expect(detectWebhookType("https://webhook.office.com/webhookb2/abc")).toBe("webhook-teams");
  });

  it("identifies Teams by subdomain of webhook.office.com", () => {
    expect(detectWebhookType("https://xxxxxx.webhook.office.com/abc")).toBe("webhook-teams");
  });

  it("identifies Slack by hooks.slack.com", () => {
    expect(detectWebhookType("https://hooks.slack.com/services/T00/B00/xyz")).toBe("webhook-slack");
  });

  it("identifies Discord by discord.com", () => {
    expect(detectWebhookType("https://discord.com/api/webhooks/123/abc")).toBe("webhook-discord");
  });

  it("falls back to generic for unknown host", () => {
    expect(detectWebhookType("https://myserver.example.com/hook")).toBe("webhook-generic");
  });
});

describe("formatTeamsCard", () => {
  it("returns MessageCard with correct @type", () => {
    const card = formatTeamsCard(makeDomain(), makeTransition()) as Record<string, unknown>;
    expect(card["@type"]).toBe("MessageCard");
  });

  it("themeColor is e42e1b for available transition", () => {
    const card = formatTeamsCard(makeDomain(), makeTransition({ newStatus: "available" })) as Record<string, unknown>;
    expect(card["themeColor"]).toBe("e42e1b");
  });

  it("themeColor is c0392b for expiring transition", () => {
    const card = formatTeamsCard(makeDomain(), makeTransition({ newStatus: "expiring" })) as Record<string, unknown>;
    expect(card["themeColor"]).toBe("c0392b");
  });

  it("title contains fqdn", () => {
    const card = formatTeamsCard(makeDomain({ fqdn: "mytest.com" }), makeTransition()) as Record<string, unknown>;
    expect(card["title"]).toContain("mytest.com");
  });
});

describe("formatSlackBlocks", () => {
  it("returns blocks array with header and section", () => {
    const result = formatSlackBlocks(makeDomain(), makeTransition()) as { blocks: unknown[] };
    expect(Array.isArray(result.blocks)).toBe(true);
    expect(result.blocks.length).toBeGreaterThanOrEqual(2);
  });

  it("includes rdap context block when rdap.source is present", () => {
    const transition = { ...makeTransition(), rdap: { source: "https://rdap.verisign.com/com/v1" } };
    const result = formatSlackBlocks(makeDomain(), transition as AlertTransition) as { blocks: unknown[] };
    expect(result.blocks.some((b) => JSON.stringify(b).includes("rdap.verisign.com"))).toBe(true);
  });
});

describe("formatDiscordEmbed", () => {
  it("includes embed with color 0xe42e1b", () => {
    const result = formatDiscordEmbed(makeDomain(), makeTransition()) as { embeds: Array<{ color: number }> };
    expect(result.embeds[0]?.color).toBe(0xe42e1b);
  });
});

describe("formatNativeEmail", () => {
  it("includes fqdn in subject line", () => {
    const mime = formatNativeEmail(makeDomain({ fqdn: "drop.me" }), makeTransition(), "alerts@example.com", "user@test.com");
    expect(mime).toContain("drop.me");
  });

  it("includes newStatus in subject line", () => {
    const mime = formatNativeEmail(makeDomain(), makeTransition({ newStatus: "dropping" }), "alerts@example.com", "user@test.com");
    expect(mime).toContain("dropping");
  });

  it("sets From and To headers correctly", () => {
    const mime = formatNativeEmail(makeDomain(), makeTransition(), "from@example.com", "to@test.com");
    expect(mime).toContain("From: from@example.com");
    expect(mime).toContain("To: to@test.com");
  });

  it("includes MIME-Version header", () => {
    const mime = formatNativeEmail(makeDomain(), makeTransition(), "from@example.com", "to@test.com");
    expect(mime).toContain("MIME-Version: 1.0");
  });
});

describe("dispatchAlert — Teams webhook happy path", () => {
  it("returns [{ok:true, statusCode:200}] for a Teams channel with 200 fetchImpl", async () => {
    const channel = makeChannel({ type: "webhook-teams", target: "https://webhook.office.com/webhookb2/test" });
    const fetchMock = vi.fn(makeFetch(200));
    const results = await dispatchAlert(makeDomain(), makeTransition(), [channel], {
      env: makeEnv(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
    expect(results[0]?.statusCode).toBe(200);
    expect(results[0]?.channelId).toBe("ch-1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("dispatchAlert — allowlist rejection", () => {
  it("returns {ok:false, error matching /^not-allowed/} and does NOT call fetchImpl", async () => {
    const channel = makeChannel({
      type: "webhook-generic",
      target: "https://evil.notallowed.example.com/hook",
    });
    const fetchMock = vi.fn(makeFetch(200));
    const results = await dispatchAlert(makeDomain(), makeTransition(), [channel], {
      env: makeEnv({ WEBHOOK_HOST_ALLOWLIST: "webhook.office.com" }),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toMatch(/^not-allowed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("dispatchAlert — email, no EMAIL binding", () => {
  it("returns {ok:false, error:'email-not-configured'} when binding is absent", async () => {
    const channel = makeChannel({ type: "email", target: "user@test.com" });
    const fetchMock = vi.fn(makeFetch(200));
    const results = await dispatchAlert(makeDomain(), makeTransition(), [channel], {
      env: makeEnv({ EMAIL: undefined, ALERT_FROM_ADDRESS: "alerts@example.com" }),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toBe("email-not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns {ok:false, error:'email-not-configured'} when ALERT_FROM_ADDRESS is missing", async () => {
    const emailSend = vi.fn(() => Promise.resolve());
    const channel = makeChannel({ type: "email", target: "user@test.com" });
    const fetchMock = vi.fn(makeFetch(200));
    const results = await dispatchAlert(makeDomain(), makeTransition(), [channel], {
      env: makeEnv({ EMAIL: { send: emailSend }, ALERT_FROM_ADDRESS: undefined }),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toBe("email-not-configured");
    expect(emailSend).not.toHaveBeenCalled();
  });
});

describe("dispatchAlert — email, fully configured", () => {
  it("returns {ok:true} and calls env.EMAIL.send() once with MIME message", async () => {
    const emailSend = vi.fn(() => Promise.resolve());
    const channel = makeChannel({ type: "email", target: "user@test.com" });
    const fetchMock = vi.fn(makeFetch(200));
    const results = await dispatchAlert(makeDomain(), makeTransition(), [channel], {
      env: makeEnv({ EMAIL: { send: emailSend }, ALERT_FROM_ADDRESS: "alerts@example.com" }),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(results[0]?.ok).toBe(true);
    expect(emailSend).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    const [arg] = emailSend.mock.calls[0] as unknown as [unknown];
    const mime = arg instanceof Response ? await arg.text() : String(arg);
    expect(mime).toContain("From: alerts@example.com");
    expect(mime).toContain("To: user@test.com");
    expect(mime).toContain("MIME-Version: 1.0");
  });
});

describe("dispatchAlert — disabled channel", () => {
  it("skips disabled channel without calling fetchImpl", async () => {
    const channel = makeChannel({ disabled: 1 });
    const fetchMock = vi.fn(makeFetch(200));
    const results = await dispatchAlert(makeDomain(), makeTransition(), [channel], {
      env: makeEnv(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(results[0]?.ok).toBe(true);
    expect(results[0]?.error).toBe("disabled-skip");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from "vitest";
import { isWebhookAllowed, parseAllowlist } from "../src/webhooks.js";

describe("isWebhookAllowed — exact match", () => {
  it("exact match: webhook.office.com in allowlist allows that host", () => {
    const result = isWebhookAllowed(
      "https://webhook.office.com/webhookb2/abc",
      ["webhook.office.com"],
    );
    expect(result.allowed).toBe(true);
    expect(result.normalizedHost).toBe("webhook.office.com");
  });

  it("exact match does not match a subdomain", () => {
    const result = isWebhookAllowed(
      "https://abc.webhook.office.com/x",
      ["webhook.office.com"],
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not-allowed");
  });
});

describe("isWebhookAllowed — single-label wildcard", () => {
  it("*.webhook.office.com matches https://abc.webhook.office.com/x", () => {
    const result = isWebhookAllowed(
      "https://abc.webhook.office.com/x",
      ["*.webhook.office.com"],
    );
    expect(result.allowed).toBe(true);
    expect(result.normalizedHost).toBe("abc.webhook.office.com");
  });

  it("*.webhook.office.com does NOT match https://a.b.webhook.office.com/x (two labels)", () => {
    const result = isWebhookAllowed(
      "https://a.b.webhook.office.com/x",
      ["*.webhook.office.com"],
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not-allowed");
  });

  it("*.webhook.office.com does NOT match https://webhook.office.com/ (bare base)", () => {
    const result = isWebhookAllowed(
      "https://webhook.office.com/x",
      ["*.webhook.office.com"],
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not-allowed");
  });
});

describe("isWebhookAllowed — canonicalization", () => {
  it("uppercase host is normalized to lowercase and matches allowlist", () => {
    const result = isWebhookAllowed(
      "https://WEBHOOK.office.COM./x",
      ["webhook.office.com"],
    );
    expect(result.allowed).toBe(true);
    expect(result.normalizedHost).toBe("webhook.office.com");
  });

  it("trailing dot stripped from host before matching", () => {
    const result = isWebhookAllowed(
      "https://webhook.office.com./x",
      ["webhook.office.com"],
    );
    expect(result.allowed).toBe(true);
    expect(result.normalizedHost).toBe("webhook.office.com");
  });
});

describe("isWebhookAllowed — rejections", () => {
  it("rejects http:// (non-HTTPS)", () => {
    const result = isWebhookAllowed(
      "http://webhook.office.com/x",
      ["webhook.office.com"],
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("non-https");
  });

  it("rejects literal IPv4 address", () => {
    const result = isWebhookAllowed(
      "https://10.0.0.5/webhook",
      ["10.0.0.5"],
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("literal-ipv4");
  });

  it("rejects literal IPv6 address", () => {
    const result = isWebhookAllowed(
      "https://[::1]/webhook",
      ["[::1]"],
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("literal-ipv6");
  });

  it("rejects host not in allowlist", () => {
    const result = isWebhookAllowed(
      "https://evil.example.com/hook",
      ["webhook.office.com", "hooks.slack.com"],
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not-allowed");
  });

  it("rejects invalid URL", () => {
    const result = isWebhookAllowed("not-a-url", ["webhook.office.com"]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("invalid-url");
  });
});

describe("parseAllowlist", () => {
  it("falls back to defaults when env var is empty string", () => {
    const result = parseAllowlist("");
    expect(result).toContain("*.webhook.office.com");
    expect(result).toContain("hooks.slack.com");
  });

  it("falls back to defaults when env var is undefined", () => {
    const result = parseAllowlist(undefined);
    expect(result).toContain("*.webhook.office.com");
  });

  it("splits and trims entries", () => {
    const result = parseAllowlist(
      "  hooks.slack.com ,  discord.com  , webhook.office.com ",
    );
    expect(result).toEqual(["hooks.slack.com", "discord.com", "webhook.office.com"]);
  });

  it("deduplicates entries", () => {
    const result = parseAllowlist("hooks.slack.com,hooks.slack.com,discord.com");
    expect(result).toEqual(["hooks.slack.com", "discord.com"]);
  });
});

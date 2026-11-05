/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const base = "https://example.com";
const authorization = `Basic ${btoa("agentel:synthetic-local-operator-password-20261015")}`;
const outbound = vi.fn(() => {
  throw new Error("Unexpected outbound request blocked by local test");
});
beforeAll(() => {
  vi.stubGlobal("fetch", outbound);
});
afterAll(() => {
  expect(outbound).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("production Worker access and routing", () => {
  for (const path of [
    "/",
    "/favicon.ico",
    "/agents/chat-agent/unauth",
    "/agents/chat-agent/unauth/get-messages"
  ]) {
    it(`denies unauthenticated ${path}`, async () => {
      const response = await SELF.fetch(base + path);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Basic");
      expect(response.headers.get("cache-control")).toBe("no-store");
    });
  }
  it("denies wrong operator credentials", async () => {
    expect(
      (
        await SELF.fetch(base, {
          headers: { authorization: `Basic ${btoa("wrong:invalid")}` }
        })
      ).status
    ).toBe(401);
  });
  it("rejects cross-origin RPC with otherwise valid credentials", async () => {
    expect(
      (
        await SELF.fetch(base + "/agents/chat-agent/cross-origin", {
          method: "POST",
          headers: { authorization, origin: "https://untrusted.example" },
          body: "{}"
        })
      ).status
    ).toBe(403);
  });
  it("rejects cross-site fetch metadata without an Origin header", async () => {
    expect(
      (
        await SELF.fetch(base, {
          headers: { authorization, "sec-fetch-site": "cross-site" }
        })
      ).status
    ).toBe(403);
  });
  it("rejects cross-origin WebSocket upgrades", async () => {
    expect(
      (
        await SELF.fetch(base + "/agents/chat-agent/cross-origin-ws", {
          headers: {
            authorization,
            origin: "https://untrusted.example",
            upgrade: "websocket"
          }
        })
      ).status
    ).toBe(403);
  });
  it("serves the built React entry after valid authentication", async () => {
    const response = await SELF.fetch(base, { headers: { authorization } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('id="root"');
  });
  it("opens a real authenticated Durable Object WebSocket", async () => {
    const response = await SELF.fetch(
      base + "/agents/chat-agent/runtime-test",
      { headers: { authorization, origin: base, upgrade: "websocket" } }
    );
    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
    response.webSocket!.accept();
    response.webSocket!.close(1000, "test complete");
  });
});

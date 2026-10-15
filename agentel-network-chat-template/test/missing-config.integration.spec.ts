/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { SELF } from "cloudflare:test";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
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
it("missing operator configuration fails closed before routing or outbound traffic", async () => {
  for (const path of ["/", "/favicon.ico", "/agents/chat-agent/missing"]) {
    const response = await SELF.fetch("https://example.com" + path);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Configure a DEMO_ACCESS_TOKEN");
  }
});

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const origin = "https://example.com";
const token = "test-owner-token-longer-than-24-characters";

function authorizedRequest(path: string, options: RequestInit = {}) {
	return new Request(`${origin}${path}`, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			...(options.headers ?? {}),
		},
	});
}

describe("personal MCP gateway", () => {
	it("shows a public introduction without private data", async () => {
		const response = await SELF.fetch(`${origin}/`);
		const html = await response.text();
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(html).toContain("Personal MCP for Browser Tools");
		expect(html).not.toContain(token);
	});

	it("requires the owner token for health and MCP endpoints", async () => {
		for (const path of ["/health", "/mcp"]) {
			const response = await SELF.fetch(`${origin}${path}`);
			expect(response.status).toBe(401);
		}
	});

	it("rejects an incorrect token", async () => {
		const response = await SELF.fetch(
			authorizedRequest("/health", {
				headers: { Authorization: "Bearer wrong-token" },
			}),
		);
		expect(response.status).toBe(401);
	});

	it("reports health with the correct token", async () => {
		const response = await SELF.fetch(authorizedRequest("/health"));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			ok: true,
			service: "sellerfeeds-personal-mcp",
		});
	});

	it("lists the built-in report tool over MCP", async () => {
		const response = await SELF.fetch(
			authorizedRequest("/mcp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
			}),
		);
		const result = (await response.json()) as {
			result?: { tools?: Array<{ name: string }> };
		};
		expect(response.status).toBe(200);
		expect(result.result?.tools).toContainEqual(
			expect.objectContaining({ name: "get_report" }),
		);
	});

	it("rejects an invalid JSON-RPC request", async () => {
		const response = await SELF.fetch(
			authorizedRequest("/mcp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ method: "tools/list" }),
			}),
		);
		expect(response.status).toBe(400);
		const result = (await response.json()) as { error?: { message: string } };
		expect(result.error?.message).toBe("Invalid JSON-RPC request");
	});
});

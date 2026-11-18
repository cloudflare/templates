import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const ADMIN_TOKEN = "test-admin-token";

describe("Agent Commerce Analytics", () => {
	it("returns 200 and JSON on /api (service info)", async () => {
		const response = await SELF.fetch("https://example.com/api");
		expect(response.status).toBe(200);
		const json = (await response.json()) as Record<string, unknown>;
		expect(json).toHaveProperty("service");
		expect(json).toHaveProperty("endpoints");
		expect(json).toHaveProperty("merchant");
	});

	it("seeds demo data and returns a non-empty dashboard summary", async () => {
		const response = await SELF.fetch("https://example.com/api/dashboard");
		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			merchantName: string;
			totalEvents: number;
			uniqueAgents: number;
			agentBreakdown: unknown[];
			funnel: { discoveryReads: number };
			revenue: { estimatedTotal: number };
		};
		expect(json.merchantName).toBeTruthy();
		expect(json.totalEvents).toBeGreaterThan(0);
		expect(json.uniqueAgents).toBeGreaterThan(0);
		expect(json.agentBreakdown).toBeInstanceOf(Array);
		expect(json.funnel.discoveryReads).toBeGreaterThan(0);
		expect(json.revenue.estimatedTotal).toBeGreaterThan(0);
	});

	it("returns just the funnel on /api/dashboard/funnel", async () => {
		const response = await SELF.fetch(
			"https://example.com/api/dashboard/funnel",
		);
		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			discoveryReads: number;
			checkoutAttempts: number;
		};
		expect(json).toHaveProperty("discoveryReads");
		expect(json).toHaveProperty("checkoutAttempts");
	});

	it("returns agent profiles on /api/dashboard/agents", async () => {
		const response = await SELF.fetch(
			"https://example.com/api/dashboard/agents",
		);
		expect(response.status).toBe(200);
		const json = (await response.json()) as Array<{ agentId: string }>;
		expect(json).toBeInstanceOf(Array);
		expect(json.length).toBeGreaterThan(0);
		expect(json[0]).toHaveProperty("agentId");
	});

	it("rejects a malformed event body", async () => {
		const response = await SELF.fetch("https://example.com/api/events", {
			method: "POST",
			body: "not-json",
			headers: { "content-type": "application/json" },
		});
		expect(response.status).toBe(400);
	});

	it("accepts a well-formed event and returns success", async () => {
		const event = {
			timestamp: new Date().toISOString(),
			agentId: "test:roundtrip",
			agentName: "Roundtrip Bot",
			agentNetwork: "visa",
			verified: true,
			action: "llms_txt_concise",
			path: "/llms.txt",
			productSlug: null,
			searchQuery: "roundtrip test query",
			statusCode: 200,
		};
		const response = await SELF.fetch("https://example.com/api/events", {
			method: "POST",
			body: JSON.stringify(event),
			headers: { "content-type": "application/json" },
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as { success: boolean };
		expect(json.success).toBe(true);
	});

	it("DELETE /api/events with a valid admin token returns success", async () => {
		const response = await SELF.fetch("https://example.com/api/events", {
			method: "DELETE",
			headers: { "x-admin-token": ADMIN_TOKEN },
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			success: boolean;
			cleared: number;
		};
		expect(json.success).toBe(true);
		expect(typeof json.cleared).toBe("number");
	});

	it("rejects DELETE /api/events without the admin token", async () => {
		const response = await SELF.fetch("https://example.com/api/events", {
			method: "DELETE",
		});
		expect(response.status).toBe(403);
	});

	it("rejects DELETE /api/events with a wrong admin token", async () => {
		const response = await SELF.fetch("https://example.com/api/events", {
			method: "DELETE",
			headers: { "x-admin-token": "not-the-real-token" },
		});
		expect(response.status).toBe(403);
	});

	it("records an event from cf-agent-* headers and surfaces it in the dashboard", async () => {
		const response = await SELF.fetch(
			"https://example.com/api/events/from-headers",
			{
				method: "POST",
				body: JSON.stringify({
					path: "/api/products/little-ripper-toddler-skis",
					statusCode: 200,
				}),
				headers: {
					"content-type": "application/json",
					"cf-agent-id": "test:headers-agent",
					"cf-agent-name": "Headers Test Bot",
					"cf-agent-network": "mastercard",
					"cf-agent-verified": "true",
				},
			},
		);
		expect(response.status).toBe(200);

		// The dashboard will include both the seeded demo agents and the agent
		// we just recorded; assert the recorded agent shows up somewhere in the
		// breakdown rather than asserting total count.
		const dash = await SELF.fetch("https://example.com/api/dashboard");
		const json = (await dash.json()) as {
			uniqueAgents: number;
			agentBreakdown: Array<{ agentName: string | null }>;
		};
		expect(json.uniqueAgents).toBeGreaterThan(0);
		const names = json.agentBreakdown.map((a) => a.agentName);
		expect(names).toContain("Headers Test Bot");
	});
});

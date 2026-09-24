import { describe, it, expect, vi } from "vitest";
import { handleWebhook } from "./webhooks";
import type { Context } from "hono";
import type { Env } from "../types/env";

async function computeHmac(secret: string, body: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
	return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function createMockContext(options: {
	headers: Record<string, string>;
	rawBody: string;
	secret?: string;
}): Context<{ Bindings: Env }> {
	return {
		req: {
			text: vi.fn().mockResolvedValue(options.rawBody),
			header: (name: string) => {
				const lower = name.toLowerCase();
				for (const [key, value] of Object.entries(options.headers)) {
					if (key.toLowerCase() === lower) return value;
				}
				return undefined;
			},
		},
		env: {
			SHOPIFY_API_SECRET: options.secret ?? "test-secret",
		} as unknown as Env,
		json: vi.fn(
			(body, status = 200) => new Response(JSON.stringify(body), { status }),
		),
	} as unknown as Context<{ Bindings: Env }>;
}

describe("handleWebhook", () => {
	it("accepts a request with a valid HMAC signature", async () => {
		const body = JSON.stringify({ id: 123 });
		const hmac = await computeHmac("test-secret", body);
		const ctx = createMockContext({
			headers: {
				"X-Shopify-Hmac-Sha256": hmac,
				"X-Shopify-Topic": "products/create",
				"X-Shopify-Shop-Domain": "test.myshopify.com",
			},
			rawBody: body,
		});

		const response = await handleWebhook(ctx);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	it("returns 401 for an invalid HMAC signature", async () => {
		const body = JSON.stringify({ id: 123 });
		const ctx = createMockContext({
			headers: {
				"X-Shopify-Hmac-Sha256": "invalid-hmac",
				"X-Shopify-Topic": "products/create",
				"X-Shopify-Shop-Domain": "test.myshopify.com",
			},
			rawBody: body,
		});

		const response = await handleWebhook(ctx);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Unauthorized" });
	});

	it("returns 401 when the signature header is missing", async () => {
		const body = JSON.stringify({ id: 123 });
		const ctx = createMockContext({
			headers: {
				"X-Shopify-Topic": "products/create",
				"X-Shopify-Shop-Domain": "test.myshopify.com",
			},
			rawBody: body,
		});

		const response = await handleWebhook(ctx);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Unauthorized" });
	});

	it("returns 401 for a signature of the wrong length", async () => {
		const body = JSON.stringify({ id: 123 });
		const hmac = await computeHmac("test-secret", body);
		const ctx = createMockContext({
			headers: {
				// Truncated signature: base64 length leaks no secret bytes, but a
				// naive length check that returns early would still be a timing
				// oracle. timingSafeEqual must reject without early exit.
				"X-Shopify-Hmac-Sha256": hmac.slice(0, hmac.length - 4),
				"X-Shopify-Topic": "products/create",
				"X-Shopify-Shop-Domain": "test.myshopify.com",
			},
			rawBody: body,
		});

		const response = await handleWebhook(ctx);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Unauthorized" });
	});
});

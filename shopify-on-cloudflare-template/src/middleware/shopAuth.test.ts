import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentShopId } from "./shopAuth";
import type { Context } from "hono";
import type { Env } from "../types/env";

vi.mock("../db/db", () => ({
	createDb: vi.fn(),
}));

// Mock createShopify so decodeSessionToken is controllable in tests.
// The real implementation calls SHOPIFY_API_SECRET for HMAC verification
// which we cannot reproduce in unit tests without real secrets.
// createSessionStorage is also mocked — the token exchange path calls it
// to load/store the offline session, which requires a live KV namespace.
vi.mock("../shopify", () => ({
	createShopify: vi.fn(),
	createSessionStorage: vi.fn(() => ({
		loadSession: vi.fn().mockResolvedValue({ isActive: () => true }),
		storeSession: vi.fn().mockResolvedValue(undefined),
	})),
}));

import { createDb } from "../db/db";
import { createShopify } from "../shopify";

function createMockDb(dbResult: { id: string } | null) {
	const getMock = vi.fn().mockResolvedValue(dbResult);
	return {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					get: getMock,
				}),
			}),
		}),
	};
}

function mockDecodeSessionToken(dest: string) {
	vi.mocked(createShopify).mockReturnValue({
		session: {
			decodeSessionToken: vi.fn().mockResolvedValue({ dest }),
		},
	} as any);
}

function mockDecodeSessionTokenThrows(error = new Error("Invalid token")) {
	vi.mocked(createShopify).mockReturnValue({
		session: {
			decodeSessionToken: vi.fn().mockRejectedValue(error),
		},
	} as any);
}

function createMockContext(options: {
	headers?: Record<string, string>;
	query?: Record<string, string>;
	env?: Partial<Env>;
}): Context<{ Bindings: Env }> {
	return {
		req: {
			header: (name: string) => {
				const lower = name.toLowerCase();
				for (const [key, value] of Object.entries(options.headers ?? {})) {
					if (key.toLowerCase() === lower) return value;
				}
				return undefined;
			},
			query: (name: string) => options.query?.[name] ?? undefined,
		},
		env: {
			DB: {} as unknown as D1Database,
			...options.env,
		},
	} as unknown as Context<{ Bindings: Env }>;
}

describe("getCurrentShopId", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("extracts shop id from a valid verified JWT Bearer token", async () => {
		vi.mocked(createDb).mockReturnValue(
			createMockDb({ id: "shop-123" }) as any,
		);
		mockDecodeSessionToken("https://myshop.myshopify.com");

		const ctx = createMockContext({
			headers: { authorization: "Bearer valid.signed.token" },
		});

		const result = await getCurrentShopId(ctx);
		expect(result).toBe("shop-123");
	});

	it("returns null when Authorization header is missing", async () => {
		vi.mocked(createDb).mockReturnValue(createMockDb(null) as any);
		const ctx = createMockContext({});
		const result = await getCurrentShopId(ctx);
		expect(result).toBeNull();
	});

	it("falls back to x-shop-domain header in local dev when JWT verification fails", async () => {
		vi.mocked(createDb).mockReturnValue(
			createMockDb({ id: "shop-456" }) as any,
		);
		mockDecodeSessionTokenThrows();

		const ctx = createMockContext({
			headers: {
				authorization: "Bearer forged.or.expired.token",
				"x-shop-domain": "fallback.myshopify.com",
			},
			env: { ENVIRONMENT: "development" },
		});

		const result = await getCurrentShopId(ctx);
		expect(result).toBe("shop-456");
	});

	it("ignores x-shop-domain header in production when JWT verification fails", async () => {
		vi.mocked(createDb).mockReturnValue(
			createMockDb({ id: "shop-456" }) as any,
		);
		mockDecodeSessionTokenThrows();

		const ctx = createMockContext({
			headers: {
				authorization: "Bearer forged.or.expired.token",
				"x-shop-domain": "fallback.myshopify.com",
			},
		});

		const result = await getCurrentShopId(ctx);
		expect(result).toBeNull();
	});

	it("ignores x-shopify-shop-domain header (removed to prevent auth bypass)", async () => {
		vi.mocked(createDb).mockReturnValue(
			createMockDb({ id: "shop-789" }) as any,
		);
		const ctx = createMockContext({
			headers: {
				"x-shopify-shop-domain": "shopify-header.myshopify.com",
			},
		});

		const result = await getCurrentShopId(ctx);
		expect(result).toBeNull();
	});

	it("returns null when shop is uninstalled (no DB row)", async () => {
		vi.mocked(createDb).mockReturnValue(createMockDb(null) as any);
		mockDecodeSessionToken("https://uninstalled.myshopify.com");

		const ctx = createMockContext({
			headers: { authorization: "Bearer valid.signed.token" },
		});

		const result = await getCurrentShopId(ctx);
		expect(result).toBeNull();
	});

	it("returns null when JWT verification throws (forged/expired token)", async () => {
		vi.mocked(createDb).mockReturnValue(
			createMockDb({ id: "shop-123" }) as any,
		);
		mockDecodeSessionTokenThrows(new Error("JWT expired"));

		const ctx = createMockContext({
			headers: { authorization: "Bearer expired.token.here" },
		});

		const result = await getCurrentShopId(ctx);
		expect(result).toBeNull();
	});
});

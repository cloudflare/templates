import { describe, it, expect, vi, beforeEach } from "vitest";
import { authRoutes } from "./auth";

vi.mock("../shopify", () => ({
	createShopify: vi.fn(),
	createSessionStorage: vi.fn(),
}));

vi.mock("../lifecycle/install", () => ({
	onShopInstall: vi.fn(),
}));

vi.mock("../db/db", () => ({
	createDb: vi.fn(),
}));

import { createShopify, createSessionStorage } from "../shopify";
import { onShopInstall } from "../lifecycle/install";
import { createDb } from "../db/db";

function createMockDb(options: { existingShop?: boolean } = {}) {
	const getMock = vi
		.fn()
		.mockResolvedValue(options.existingShop ? { id: "existing-shop" } : null);
	const insertRunMock = vi.fn().mockResolvedValue({});
	return {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					get: getMock,
				}),
			}),
		}),
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockReturnValue({
				onConflictDoUpdate: vi.fn().mockResolvedValue({}),
			}),
		}),
	};
}

function createMockEnv(options: { existingShop?: boolean } = {}) {
	return {
		DB: {} as unknown as D1Database,
		SESSION_KV: {
			put: vi.fn().mockResolvedValue(undefined),
			get: vi.fn().mockResolvedValue(null),
			delete: vi.fn().mockResolvedValue(undefined),
		},
		SHOPIFY_CLIENT_ID: "test-client-id",
		SHOPIFY_API_SECRET: "test-secret",
		HOST: "app.example.com",
		_existingShop: options.existingShop,
	};
}

describe("/shopify/install", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 400 when shop parameter is missing", async () => {
		vi.mocked(createDb).mockReturnValue(createMockDb() as any);
		const env = createMockEnv();
		const res = await authRoutes.request("/shopify/install", {}, env);
		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: string };
		expect(json.error).toBe("Missing shop parameter");
	});

	it("redirects to app when shop is already installed", async () => {
		vi.mocked(createDb).mockReturnValue(
			createMockDb({ existingShop: true }) as any,
		);
		const env = createMockEnv({ existingShop: true });
		const res = await authRoutes.request(
			"/shopify/install?shop=test.myshopify.com",
			{},
			env,
		);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/?shop=test.myshopify.com");
	});

	it("redirects to Shopify OAuth URL for a new shop", async () => {
		vi.mocked(createDb).mockReturnValue(
			createMockDb({ existingShop: false }) as any,
		);
		const env = createMockEnv({ existingShop: false });
		const mockResponse = new Response(null, {
			status: 302,
			headers: {
				location:
					"https://test.myshopify.com/admin/oauth/authorize?client_id=test-client-id",
			},
		});

		const mockShopify = {
			auth: {
				begin: vi.fn().mockResolvedValue(mockResponse),
			},
		};

		vi.mocked(createShopify).mockReturnValue(mockShopify as any);

		const res = await authRoutes.request(
			"/shopify/install?shop=test.myshopify.com",
			{},
			env,
		);
		expect(res.status).toBe(302);
		expect(mockShopify.auth.begin).toHaveBeenCalledWith({
			shop: "test.myshopify.com",
			callbackPath: "/shopify/callback",
			isOnline: false,
			rawRequest: expect.any(Request),
		});
	});
});

describe("/shopify/callback", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("calls install lifecycle and redirects to app on success", async () => {
		vi.mocked(createDb).mockReturnValue(createMockDb() as any);
		const env = createMockEnv({ existingShop: false });
		const session = {
			id: "session-123",
			shop: "test.myshopify.com",
			accessToken: "token-abc",
		};

		const mockShopify = {
			auth: {
				callback: vi.fn().mockResolvedValue({ session }),
			},
		};

		const mockSessionStorage = {
			storeSession: vi.fn().mockResolvedValue(undefined),
			loadSession: vi.fn().mockResolvedValue(session),
		};

		vi.mocked(createShopify).mockReturnValue(mockShopify as any);
		vi.mocked(createSessionStorage).mockReturnValue(mockSessionStorage as any);
		vi.mocked(onShopInstall).mockResolvedValue(undefined);

		const res = await authRoutes.request(
			"/shopify/callback?code=authcode&shop=test.myshopify.com",
			{},
			env,
		);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/?shop=test.myshopify.com");
		expect(mockSessionStorage.storeSession).toHaveBeenCalledWith(session);
		expect(onShopInstall).toHaveBeenCalledWith(
			"test.myshopify.com",
			{
				shop: "test.myshopify.com",
				accessToken: "token-abc",
				id: "session-123",
			},
			env,
		);
	});
});

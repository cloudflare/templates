import { describe, it, expect, vi, beforeEach } from "vitest";

// Run the real Hono app in-process with the data + Shopify layers mocked, so
// the protected-route flow is exercised end-to-end with no real bindings or
// credentials (mirrors the mocking style of the other unit tests).
vi.mock("./db/db", () => ({
	setDb: vi.fn(),
	createDb: vi.fn(),
}));
vi.mock("./shopify", () => ({
	createShopify: vi.fn(),
	createSessionStorage: vi.fn(),
}));

import { app } from "./index";
import { createDb } from "./db/db";

// Minimal chainable Drizzle stand-in: `.select().from().where().get()` resolves
// to the given row (or null). Typed as the createDb return so call sites need
// no cast.
function mockDb(row: { id: string } | null): ReturnType<typeof createDb> {
	return {
		select: () => ({
			from: () => ({
				where: () => ({
					get: () => Promise.resolve(row),
				}),
			}),
		}),
	} as unknown as ReturnType<typeof createDb>;
}

// The DB/KV/R2 bindings are mocked above and never read on this path, so we
// pass only the variable the auth fallback actually checks.
const env = (environment: "development" | "production") => ({
	ENVIRONMENT: environment,
});

describe("GET /api/example (protected by requireShop)", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns 401 for unauthenticated requests", async () => {
		vi.mocked(createDb).mockReturnValue(mockDb(null));
		const res = await app.request("/api/example", {}, env("development"));
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Unauthorized" });
	});

	it("returns the shop id for an installed shop via the dev header fallback", async () => {
		vi.mocked(createDb).mockReturnValue(mockDb({ id: "shop-abc" }));
		const res = await app.request(
			"/api/example",
			{ headers: { "x-shop-domain": "mystore.myshopify.com" } },
			env("development"),
		);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { shopId: string; now: string };
		expect(json.shopId).toBe("shop-abc");
		expect(json.now).toBeTruthy();
	});

	it("ignores the dev header fallback when ENVIRONMENT is not development", async () => {
		vi.mocked(createDb).mockReturnValue(mockDb({ id: "shop-abc" }));
		const res = await app.request(
			"/api/example",
			{ headers: { "x-shop-domain": "mystore.myshopify.com" } },
			env("production"),
		);
		expect(res.status).toBe(401);
	});
});

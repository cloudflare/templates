import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const post = (path: string, body: unknown, tenant: string) =>
	SELF.fetch(`http://example.com${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-bounda-tenant": tenant },
		body: JSON.stringify(body),
	});

const placeOrder = (tenant: string, customerId: string, total: number) =>
	post(
		"/commands/placeOrder",
		{ orderId: crypto.randomUUID(), customerId, total },
		tenant,
	);

const listOrders = async (tenant: string, customerId: string) =>
	(await post("/queries/listOrders", { customerId }, tenant)).json<{
		orders: { customerId: string; total: number }[];
		total: number;
	}>();

describe("the orders API", () => {
	it("stores a command as the first version of its order", async () => {
		const response = await placeOrder("stores", "ada", 42);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			scheduled: false,
			version: 1,
		});
	});

	it("answers a query with the command that came right before it", async () => {
		await placeOrder("reads", "ada", 42);
		await placeOrder("reads", "ada", 8);
		expect(await listOrders("reads", "ada")).toMatchObject({ total: 50 });
	});

	it("keeps every tenant in its own Durable Object", async () => {
		await placeOrder("tenant-a", "ada", 10);
		expect((await listOrders("tenant-a", "ada")).orders).toHaveLength(1);
		expect((await listOrders("tenant-b", "ada")).orders).toHaveLength(0);
	});

	it("refuses an invalid payload with the issues", async () => {
		const response = await post(
			"/commands/placeOrder",
			{ customerId: "ada", total: -1 },
			"invalid",
		);
		expect(response.status).toBe(400);
	});

	it("refuses to place the same order twice", async () => {
		const orderId = crypto.randomUUID();
		const body = { orderId, customerId: "ada", total: 1 };
		expect((await post("/commands/placeOrder", body, "twice")).status).toBe(
			200,
		);
		expect((await post("/commands/placeOrder", body, "twice")).status).toBe(
			409,
		);
	});

	it("names what it does not know", async () => {
		expect((await post("/commands/shipOrder", {}, "unknown")).status).toBe(404);
		expect((await post("/queries/nope", {}, "unknown")).status).toBe(404);
	});
});

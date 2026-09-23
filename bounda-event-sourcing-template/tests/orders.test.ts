import { DomainError } from "@bounda-dev/core";
import { createTestApp } from "@bounda-dev/core/testing";
import { describe, expect, it } from "vitest";
import { registry } from "../.bounda/registry.ts";

const orderId = "018f6a5e-4c3c-7c1e-9d4b-0b2c4a1d8e01";

describe("orders", () => {
	it("places an order and lists it for the customer", async () => {
		const { app } = await createTestApp({ registry });
		await app.commands.placeOrder({ orderId, customerId: "ada", total: 42 });
		await app.processUntilIdle();

		expect(await app.queries.listOrders({ customerId: "ada" })).toEqual({
			orders: [
				{ orderId, customerId: "ada", total: 42, placedAt: expect.any(Date) },
			],
			total: 42,
		});
		await expect(
			app.commands.placeOrder({ orderId, customerId: "ada", total: 1 }),
		).rejects.toBeInstanceOf(DomainError);
		await app.stop();
	});
});

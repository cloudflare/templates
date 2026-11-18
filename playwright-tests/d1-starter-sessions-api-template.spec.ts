import { test, expect } from "./fixtures";

test("preserves read-after-write consistency in a D1 session", async ({
	request,
	templateUrl,
}) => {
	const reset = await request.post(`${templateUrl}/api/reset`);
	expect(reset.status()).toBe(200);

	const created = await request.post(`${templateUrl}/api/orders`, {
		data: { orderId: "e2e-order", customerId: "e2e-customer", quantity: 2 },
	});
	expect(created.status()).toBe(200);
	expect(created.headers()["x-d1-bookmark"]).toBeTruthy();
	const body = (await created.json()) as {
		results: Array<{ orderId: string }>;
	};
	expect(body.results).toContainEqual(
		expect.objectContaining({ orderId: "e2e-order" }),
	);
});

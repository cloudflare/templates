// test/index.spec.ts
import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("d1-starter-sessions-api worker", () => {
	it("list empty orders", async () => {
		const request = new IncomingRequest("http://example.com/api/orders");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.json()).toMatchObject({
			d1Latency: expect.any(Number),
			results: [],
			sessionBookmark: expect.any(String),
		});
	});

	it("create random order", async () => {
		const request = new IncomingRequest("http://example.com/api/orders", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				customerId: "customer-id-test",
				orderId: "random-id-123",
				quantity: 98,
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.json()).toMatchObject({
			d1Latency: expect.any(Number),
			results: [
				{
					customerId: "customer-id-test",
					orderId: "random-id-123",
					quantity: 98,
				},
			],
			sessionBookmark: expect.any(String),
		});
	});
});

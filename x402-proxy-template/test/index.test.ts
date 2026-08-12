import assert from "node:assert/strict";
import { describe, it } from "node:test";
import app from "../src";
import type { Env } from "../src/env";

function requestWithRawUrl(url: string): Request {
	const request = new Request("https://example.com/");
	Object.defineProperty(request, "url", { value: url });
	return request;
}

function createEnv() {
	let originFetchCalls = 0;
	const env = {
		ORIGIN_SERVICE: {
			fetch: async () => {
				originFetchCalls++;
				return new Response("origin content");
			},
		},
		PROTECTED_PATTERNS: [
			{
				pattern: "/premium/*",
				price: "$0.01",
				description: "Premium content",
			},
		],
	} as unknown as Env;

	return { env, getOriginFetchCalls: () => originFetchCalls };
}

describe("x402 protected route matching", () => {
	it("rejects a leading dot segment instead of proxying protected content", async () => {
		const { env, getOriginFetchCalls } = createEnv();

		const response = await app.fetch(
			requestWithRawUrl("https://example.com/./premium/secret"),
			env
		);

		assert.equal(response.status, 400);
		assert.equal(getOriginFetchCalls(), 0);
	});

	it("rejects parent segments instead of proxying protected content", async () => {
		const { env, getOriginFetchCalls } = createEnv();

		const response = await app.fetch(
			requestWithRawUrl("https://example.com/free/../premium/secret"),
			env
		);

		assert.equal(response.status, 400);
		assert.equal(getOriginFetchCalls(), 0);
	});

	it("rejects percent-encoded dot segments", async () => {
		const { env, getOriginFetchCalls } = createEnv();

		const response = await app.fetch(
			requestWithRawUrl("https://example.com/%2e/premium/secret"),
			env
		);

		assert.equal(response.status, 400);
		assert.equal(getOriginFetchCalls(), 0);
	});

	it("rejects repeated slashes instead of relying on origin normalization", async () => {
		const { env, getOriginFetchCalls } = createEnv();

		const response = await app.fetch(
			requestWithRawUrl("https://example.com//premium/secret"),
			env
		);

		assert.equal(response.status, 400);
		assert.equal(getOriginFetchCalls(), 0);
	});

	it("continues to protect canonical wildcard paths", async () => {
		const { env, getOriginFetchCalls } = createEnv();

		const response = await app.fetch(
			requestWithRawUrl("https://example.com/premium/secret"),
			env
		);

		assert.equal(response.status, 500);
		assert.equal(getOriginFetchCalls(), 0);
	});

	it("protects the wildcard prefix itself", async () => {
		const { env, getOriginFetchCalls } = createEnv();

		const response = await app.fetch(
			requestWithRawUrl("https://example.com/premium"),
			env
		);

		assert.equal(response.status, 500);
		assert.equal(getOriginFetchCalls(), 0);
	});

	it("matches percent-encoded ordinary characters using Hono semantics", async () => {
		const { env, getOriginFetchCalls } = createEnv();

		const response = await app.fetch(
			requestWithRawUrl("https://example.com/%70remium/secret"),
			env
		);

		assert.equal(response.status, 500);
		assert.equal(getOriginFetchCalls(), 0);
	});

	it("does not protect paths that merely share a wildcard prefix", async () => {
		const { env, getOriginFetchCalls } = createEnv();

		const response = await app.fetch(
			requestWithRawUrl("https://example.com/premiumXYZ"),
			env
		);

		assert.equal(response.status, 200);
		assert.equal(await response.text(), "origin content");
		assert.equal(getOriginFetchCalls(), 1);
	});
});

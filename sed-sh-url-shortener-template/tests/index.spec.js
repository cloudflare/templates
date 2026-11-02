import { test, expect } from "@playwright/test";

test("returns 405 for GET requests", async ({ request }) => {
	const response = await request.get("http://localhost:8787/");
	expect(response.status()).toBe(405);
	const body = await response.json();
	expect(body.error).toBeTruthy();
});

test("returns 400 for missing targetUrl field", async ({ request }) => {
	const response = await request.post("http://localhost:8787/", {
		data: {},
	});
	expect(response.status()).toBe(400);
	const body = await response.json();
	expect(body.error).toContain("targetUrl");
});

test("returns 400 for invalid JSON", async ({ request }) => {
	const response = await request.post("http://localhost:8787/", {
		headers: { "Content-Type": "application/json" },
		data: "not json",
	});
	expect(response.status()).toBe(400);
});

test("handles CORS preflight", async ({ request }) => {
	const response = await request.fetch("http://localhost:8787/", {
		method: "OPTIONS",
	});
	expect(response.status()).toBe(200);
	expect(response.headers()["access-control-allow-origin"]).toBe("*");
	expect(response.headers()["access-control-allow-methods"]).toContain("POST");
});

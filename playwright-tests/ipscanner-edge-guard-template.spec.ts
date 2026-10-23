import { expect, test } from "./fixtures";

test.describe("IPScanner Edge Guard", () => {
	test("shows the setup page when no origin is configured", async ({
		request,
		templateUrl,
	}) => {
		const res = await request.get(templateUrl);
		expect(res.status()).toBe(200);
		const body = await res.text();
		expect(body).toContain("<h1>IPScanner edge guard</h1>");
		expect(body).toContain("ORIGIN_URL");
	});

	test("passes requests through when the API key is missing", async ({
		request,
		templateUrl,
	}) => {
		const res = await request.get(`${templateUrl}/some/page`);
		expect(res.status()).toBe(200);
		const body = await res.text();
		expect(body).toContain("API key missing");
		expect(body).toContain("x-ipscanner-status");
		expect(body).toContain("skipped");
	});

	test("ignores spoofed verdict headers", async ({ request, templateUrl }) => {
		const res = await request.get(templateUrl, {
			headers: { "X-IPScanner-Class": "known_bot" },
		});
		expect(await res.text()).not.toContain("known_bot");
	});
});

import { test, expect } from "./fixtures";

test("routes and rewrites a mounted microfrontend", async ({
	request,
	templateUrl,
}) => {
	const response = await request.get(`${templateUrl}/app1/hello`);
	expect(response.status()).toBe(200);
	const html = await response.text();
	expect(html).toContain("Worker A");
	expect(html).toContain("/hello");
	expect(html).toContain('src="/app1/assets/logo.png"');
});

import { test, expect } from "./fixtures";

test("serves requests through the Node.js HTTP compatibility layer", async ({
	request,
	templateUrl,
}) => {
	const home = await request.get(templateUrl);
	expect(home.status()).toBe(200);
	expect(await home.text()).toContain("Welcome to my Node.js app on Workers!");

	const status = await request.get(`${templateUrl}/api/status`);
	expect(status.status()).toBe(200);
	expect(await status.json()).toEqual(
		expect.objectContaining({ status: "ok", timestamp: expect.any(Number) }),
	);
});

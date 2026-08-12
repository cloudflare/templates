import { test, expect } from "./fixtures";

test("returns a PNG generated through the AI binding boundary", async ({
	request,
	templateUrl,
}) => {
	const response = await request.get(templateUrl);
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toContain("image/png");
	expect([...Buffer.from(await response.body()).subarray(0, 8)]).toEqual([
		137, 80, 78, 71, 13, 10, 26, 10,
	]);
});

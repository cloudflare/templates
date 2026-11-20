import { test, expect } from "./fixtures";

test("returns a JPEG generated through the AI binding boundary, retrying a flagged image", async ({
	request,
	templateUrl,
}) => {
	const response = await request.get(templateUrl, { timeout: 90_000 });
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toContain("image/jpeg");
	expect([...Buffer.from(await response.body()).subarray(0, 4)]).toEqual([
		0xff, 0xd8, 0xff, 0xe0,
	]);
});

import { test, expect } from "./fixtures";

test("lists the available container endpoints", async ({
	request,
	templateUrl,
}) => {
	const response = await request.get(templateUrl);
	expect(response.status()).toBe(200);
	expect(await response.text()).toContain("GET /container/<ID>");
});

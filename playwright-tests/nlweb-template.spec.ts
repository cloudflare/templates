import { test, expect } from "./fixtures";

test("serves the chat UI and version endpoint", async ({
	page,
	request,
	templateUrl,
}) => {
	await page.goto(templateUrl);
	await expect(page).toHaveTitle("NLWeb Chat");

	const version = await request.get(`${templateUrl}/version`);
	expect(version.status()).toBe(200);
	expect(await version.json()).toEqual({ version: "1.0.0" });
});

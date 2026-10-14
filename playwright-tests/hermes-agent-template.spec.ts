import { test, expect } from "./fixtures";

test("explains required configuration before starting a workspace", async ({
	page,
	templateUrl,
}) => {
	await page.goto(templateUrl);
	await expect(
		page.getByRole("heading", { name: "Set up Hermes Agent" }),
	).toBeVisible();
	await expect(
		page.getByText("ACCESS_TEAM_DOMAIN", { exact: true }),
	).toBeVisible();
	await expect(page.getByText("ACCESS_AUD", { exact: true })).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Follow the Hermes setup guide" }),
	).toHaveAttribute(
		"href",
		"https://developers.cloudflare.com/sandbox/coding-agents/hermes/",
	);
});

test("does not expose dashboard APIs before configuration", async ({
	request,
	templateUrl,
}) => {
	const response = await request.get(`${templateUrl}/api/status`);
	expect(response.status()).toBe(503);
	expect(await response.text()).toBe("Configure Access and AI Gateway first");
});

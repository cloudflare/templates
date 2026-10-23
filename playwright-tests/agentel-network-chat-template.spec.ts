import { test, expect } from "./fixtures";

// Optional existing local browser; CI defaults to the pinned Playwright runtime.
test.use({
	launchOptions: process.env.AGENTEL_LOCAL_CHROMIUM
		? { executablePath: process.env.AGENTEL_LOCAL_CHROMIUM }
		: {},
});

const credentials = {
	username: "agentel",
	password: "synthetic-local-operator-password-20261015",
};

test("unauthenticated UI and asset requests stay protected", async ({
	templateUrl,
	playwright,
}) => {
	const request = await playwright.request.newContext();
	try {
		for (const path of [
			"/",
			"/favicon.ico",
			"/agents/chat-agent/browser-unauth",
		]) {
			const response = await request.get(templateUrl + path);
			expect(response.status()).toBe(401);
		}
	} finally {
		await request.dispose();
	}
});

test.describe("authenticated operator", () => {
	test.use({ httpCredentials: credentials });
	test.beforeEach(async ({ page, templateUrl }) => {
		await page.route("**/*", (route) => {
			const url = new URL(route.request().url());
			if (url.origin === new URL(templateUrl).origin) return route.continue();
			return route.abort("blockedbyclient");
		});
	});
	test("loads real React and establishes the Agent connection", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);
		await expect(page.getByText("Connected", { exact: true })).toBeVisible();
		await expect(
			page.getByRole("button", { name: "MCP", exact: true }),
		).toBeVisible();
	});
	test("missing Reader is shown as an error through actual Agent RPC", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);
		await expect(page.getByText("Connected", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "MCP", exact: true }).click();
		await page
			.getByRole("button", { name: "Connect / refresh Agentel" })
			.click();
		await expect(
			page.getByText(
				"Check the server's Reader key and scope, then reconnect.",
			),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Connect / refresh Agentel" }),
		).toBeEnabled();
	});
	test("stops a local setup turn, clears non-empty history and persists Clear", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);
		await expect(page.getByText("Connected", { exact: true })).toBeVisible();
		const marker = `local-history-marker-${crypto.randomUUID()}`;
		await page.getByPlaceholder("Send a message...").fill(marker);
		await page.getByRole("button", { name: "Send message" }).click();
		await expect(page.getByText(marker, { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Stop generation" }).click();
		await expect(
			page.getByRole("button", { name: "Send message" }),
		).toBeVisible({ timeout: 25000 });
		await page.reload();
		await expect(page.getByText(marker, { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Clear", exact: true }).click();
		await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
		await page.reload();
		await expect(page.getByText("Connected", { exact: true })).toBeVisible();
		await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
	});
});

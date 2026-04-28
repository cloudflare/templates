import { test, expect } from "./fixtures";

test.describe("HyperFrames Template", () => {
	test("preview UI loads and wires the player", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "HyperFrames on Cloudflare" }),
		).toBeVisible();

		await expect(
			page.getByRole("button", { name: "Render MP4" }),
		).toBeVisible();

		const playerSrc = await page
			.locator("hyperframes-player")
			.getAttribute("src");
		expect(playerSrc).toBe("/api/preview");

		await page.waitForFunction(
			() => !!customElements.get("hyperframes-player"),
		);
	});

	test("/api/preview serves the bundled composition", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(`${templateUrl}/api/preview`);
		expect(response?.status()).toBe(200);
		await expect(page).toHaveTitle(/UI 3D Reveal/);
	});
});

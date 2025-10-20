import { test, expect } from "./fixtures";

test.describe("Astro Blog Starter Template", () => {
	test("should render correctly", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(page.getByRole("link", { name: "Astro Blog" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Blog", exact: true }),
		).toBeVisible();
		await expect(page.getByRole("link", { name: "About" })).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "🧑‍🚀 Hello, Astronaut!" }),
		).toBeVisible();
		await expect(
			page
				.getByRole("navigation")
				.getByRole("link", { name: "Follow Astro on Mastodon" }),
		).toBeVisible();
		await expect(
			page
				.getByRole("navigation")
				.getByRole("link", { name: "Follow Astro on Twitter" }),
		).toBeVisible();
		await page.getByRole("link", { name: "Blog", exact: true }).click();
		await expect(
			page.getByRole("link", { name: "Markdown Style Guide Jun 19," }),
		).toBeVisible();
		await page.getByRole("link", { name: "About" }).click();
		await expect(page.locator("img")).toBeVisible();
	});
});

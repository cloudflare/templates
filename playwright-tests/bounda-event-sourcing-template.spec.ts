import { expect, test } from "./fixtures";

test.describe("Event Sourcing with Bounda Template", () => {
	test("places an order and lists it", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(
			page.getByRole("heading", { name: "Event-sourced orders" }),
		).toBeVisible();

		await page.getByLabel("Tenant").fill(`e2e-${Date.now()}`);
		await page.getByLabel("Customer").fill("ada");
		await page.getByLabel("Total").fill("42");
		await page.getByRole("button", { name: "Place order" }).click();

		await expect(page.getByText("Stored as version 1.")).toBeVisible();
		await expect(page.getByText("ada: 1 order(s), 42 in total")).toBeVisible();
	});
});

import { test, expect } from "./fixtures";

test.describe("Chanfana OpenAPI Template", () => {
	test("should load OpenAPI documentation", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "My Awesome API 2.0.0 OAS" }),
		).toBeVisible();
		await expect(page.getByText("This is the documentation for")).toBeVisible();
		await page.getByRole("button", { name: "GET /tasks", exact: true }).click();
		await page.getByRole("button", { name: "Try it out" }).click();
		await page.getByRole("button", { name: "Execute" }).click();
		await expect(page.getByRole("cell", { name: "200" }).first()).toBeVisible();

		const successLocator = page
			.locator("pre")
			.filter({
				hasText: '"success": true',
			})
			.first();
		await successLocator.scrollIntoViewIfNeeded();
		await expect(successLocator).toBeVisible();
		await page.getByRole("button", { name: "GET /tasks", exact: true }).click();
		await page
			.getByRole("button", { name: "POST /tasks", exact: true })
			.click();
		await page.getByRole("button", { name: "Try it out" }).click();
		await page.getByText('{ "name": "string", "slug": "').click();
		await page.getByRole("button", { name: "Execute" }).click();
		await expect(
			page.getByRole("table").getByRole("cell", { name: "201" }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "POST /tasks", exact: true })
			.click();
		await page
			.getByRole("button", { name: "GET /tasks/{id}", exact: true })
			.click();
		await page.getByRole("button", { name: "Try it out" }).click();
		await page.getByRole("textbox", { name: "id" }).click();
		await page.getByRole("textbox", { name: "id" }).fill("1");
		await page.getByRole("button", { name: "Execute" }).click();
		await expect(page.getByRole("cell", { name: "200" }).first()).toBeVisible();
		await page
			.getByRole("button", { name: "GET /tasks/{id}", exact: true })
			.click();
		await page
			.getByRole("button", { name: "DELETE /tasks/{id}", exact: true })
			.click();
		await page.getByRole("button", { name: "Try it out" }).click();
		await page.getByRole("textbox", { name: "id" }).click();
		await page.getByRole("textbox", { name: "id" }).fill("1");
		await page.getByRole("button", { name: "Execute" }).click();
		await expect(page.getByRole("cell", { name: "200" }).first()).toBeVisible();
	});
});

import { test, expect } from "./fixtures";

test("public introduction loads without a deployment secret", async ({
	page,
	templateUrl,
}) => {
	await page.goto(templateUrl);
	await expect(
		page.getByRole("heading", { name: "Personal MCP for Browser Tools" }),
	).toBeVisible();
	await expect(page.getByText("D1, R2, and Durable Objects")).toBeVisible();
});

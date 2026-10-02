import { test, expect } from "./fixtures";

test("renders the PostgreSQL management UI without requiring a database", async ({
	page,
	templateUrl,
}) => {
	await page.goto(templateUrl);
	await expect(
		page.getByText("PostgreSQL Manager", { exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", {
			name: "Welcome to PostgreSQL Hyperdrive Manager",
		}),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Initialize Tables" }),
	).toBeVisible();
});

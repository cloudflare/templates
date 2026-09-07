import { test, expect } from "./fixtures";

test.describe("Invoice PDF Template", () => {
	test("renders an invoice and lists it", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(
			page.getByRole("heading", { name: "Invoice PDF Generator" }),
		).toBeVisible();

		// Local KV state persists between dev runs, so use a unique client name.
		const client = `Playwright Client ${Date.now()}`;
		await page.getByLabel("Client name").fill(client);
		await page.getByRole("button", { name: "Render PDF" }).click();

		await expect(page.getByText("Rendered.")).toBeVisible();
		await expect(page.getByRole("cell", { name: client })).toBeVisible();

		const pdfHref = await page
			.getByRole("link", { name: "Open PDF" })
			.first()
			.getAttribute("href");
		expect(pdfHref).toMatch(/^\/api\/invoices\/.+\/pdf$/);
		const pdf = await page.request.get(`${templateUrl}${pdfHref}`);
		expect(pdf.status()).toBe(200);
		expect(pdf.headers()["content-type"]).toBe("application/pdf");
	});

	test("shows a validation error for an empty form", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);
		await page.getByLabel("Client name").fill("Nobody");
		// Remove both seeded line items so the server rejects the request.
		const removeButtons = page.getByRole("button", {
			name: "Remove line item",
		});
		while ((await removeButtons.count()) > 0) {
			await removeButtons.first().click();
		}
		await page.getByRole("button", { name: "Render PDF" }).click();
		await expect(page.getByText("At least one line item")).toBeVisible();
	});
});

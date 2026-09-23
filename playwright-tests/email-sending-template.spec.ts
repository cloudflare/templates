import { expect, test } from "./fixtures";

test.describe("Email Sending Worker", () => {
	test("serves setup guidance", async ({ page, templateUrl }) => {
		const response = await page.goto(templateUrl);

		expect(response?.status()).toBe(200);
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: "Email Sending starter",
			}),
		).toBeVisible();
		await expect(page.locator("#send-endpoint")).toContainText("/send");
		await expect(page.getByRole("alert")).toHaveCount(0);
	});

	test("simulates an authenticated send locally", async ({
		request,
		templateUrl,
	}) => {
		const response = await request.post(`${templateUrl}/send`, {
			headers: { authorization: "Bearer test-email-sending-token" },
		});

		expect(response.status()).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			success: true,
			messageId: expect.any(String),
		});
	});
});

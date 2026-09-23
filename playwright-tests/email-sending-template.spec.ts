import { expect, test } from "./fixtures";

const useLivePreview = process.env.PLAYWRIGHT_USE_LIVE === "true";

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
		if (useLivePreview) {
			await expect(page.getByRole("alert")).toContainText(
				"Replace the example email addresses",
			);
		} else {
			await expect(page.getByRole("alert")).toHaveCount(0);
		}
	});

	test("handles the preview send request safely", async ({
		request,
		templateUrl,
	}) => {
		const response = await request.post(`${templateUrl}/send`, {
			headers: { authorization: "Bearer test-email-sending-token" },
		});

		if (useLivePreview) {
			expect(response.status()).toBe(401);
			expect(response.headers()["cache-control"]).toBe("no-store");
			expect(response.headers()["www-authenticate"]).toBe("Bearer");
			await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
			return;
		}

		expect(response.status()).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			success: true,
			messageId: expect.any(String),
		});
	});
});

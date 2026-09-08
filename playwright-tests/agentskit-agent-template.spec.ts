import { expect, test } from "./fixtures";

test.describe("AgentsKit Agent Template", () => {
	test("streams an agent response through the chat UI", async ({
		page,
		templateUrl,
	}) => {
		await page.route("**/api/chat", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				body: [
					'data: {"type":"text","content":"Hello from "}\n\n',
					'data: {"type":"text","content":"the edge."}\n\n',
					'data: {"type":"done"}\n\n',
				].join(""),
			});
		});

		await page.goto(templateUrl);
		await expect(
			page.getByRole("heading", { name: /Build agents that run/ }),
		).toBeVisible();
		await expect(
			page.getByText("Cloudflare Workers AI", { exact: true }),
		).toBeVisible();

		await page.getByLabel("Message your agent").fill("Where do you run?");
		await page.getByRole("button", { name: "Send message" }).click();

		await expect(
			page.getByText("Where do you run?", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Hello from the edge.", { exact: true }),
		).toBeVisible();
	});
});

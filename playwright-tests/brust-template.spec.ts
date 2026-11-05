import { test, expect } from "./fixtures";

const DEPLOY_URL =
	"https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/brust-template";

test.describe("Brust Starter Template", () => {
	test("renders the home page", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(
			page.getByRole("heading", { name: "brust app" }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Docs", exact: true }),
		).toBeVisible();
	});

	test("counter increments after hydration", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		const counter = page.getByRole("button", { name: /count is/ });
		await expect(counter).toHaveText("count is 0");
		await expect(async () => {
			await counter.click();
			await expect(counter).not.toHaveText("count is 0", { timeout: 500 });
		}).toPass();
		const clicked = Number((await counter.textContent())?.match(/\d+/)?.[0]);
		await counter.click();
		await expect(counter).toHaveText(`count is ${clicked + 1}`);
	});

	test("hello action responds", async ({ request, templateUrl }) => {
		const response = await request.get(
			`${templateUrl}/_brust/action/hello?name=Cloudflare`,
		);
		expect(response.ok()).toBe(true);
		expect(await response.json()).toEqual({ message: "Hello, Cloudflare!" });
	});

	test("top bar navigates to the actions page", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);
		const nav = page.getByRole("navigation", { name: "Main" });
		await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		await nav.getByRole("link", { name: "Actions" }).click();
		await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
		await expect(page).toHaveURL(/\/actions$/);
		await expect(nav.getByRole("link", { name: "Actions" })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	test("greet form calls the action", async ({ page, templateUrl }) => {
		await page.goto(`${templateUrl}/actions`);
		const name = page.getByLabel("Your name");
		const submit = page.getByRole("button", { name: "Say hello" });
		await expect(async () => {
			await name.fill("Cloudflare");
			await submit.click();
			await expect(page.getByText("Hello, Cloudflare!")).toBeVisible({
				timeout: 1000,
			});
		}).toPass();
		await expect(page.getByText(/answered by the Worker at/)).toBeVisible();
	});

	test("greet action rejects an empty name", async ({
		request,
		templateUrl,
	}) => {
		const response = await request.post(`${templateUrl}/_brust/action/greet`, {
			data: { name: "" },
		});
		expect(response.status()).toBe(422);
	});

	test("every page links the Deploy to Cloudflare button", async ({
		page,
		templateUrl,
	}) => {
		for (const path of ["/", "/actions"]) {
			await page.goto(`${templateUrl}${path}`);
			const deploy = page.getByRole("link", { name: "Deploy to Cloudflare" });
			await expect(deploy).toHaveAttribute("href", DEPLOY_URL);
		}
	});
});

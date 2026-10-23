import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for local/standalone runs of this template.
 *
 * The spec in `playwright-tests/` is written to the cloudflare/templates
 * convention (it imports `./fixtures` and uses the `templateUrl` fixture), so
 * the exact same file also runs inside the cloudflare/templates monorepo, which
 * supplies its own `fixtures.ts` + config. Here we provide a thin local
 * equivalent that boots the app with `npm run dev` on port 5173.
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: "./playwright-tests",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: "html",
	use: {
		baseURL: "http://localhost:5173",
		trace: "on-first-retry",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "npm run dev",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});

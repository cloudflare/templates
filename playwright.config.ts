import { defineConfig, devices } from "@playwright/test";
import { join } from "path";
import { readdirSync, readFileSync, existsSync } from "fs";

// Function to get published templates when running live tests
function getTestIgnorePatterns(): string[] {
	const isLive = process.env.PLAYWRIGHT_USE_LIVE === "true";
	if (!isLive) return [];

	const templatesRoot = process.cwd();
	const entries = readdirSync(templatesRoot, { withFileTypes: true });
	const templateDirs = entries
		.filter((entry) => entry.isDirectory() && entry.name.endsWith("-template"))
		.map((entry) => entry.name);

	const unpublishedTemplates: string[] = [];

	for (const templateDir of templateDirs) {
		const packageJsonPath = join(templatesRoot, templateDir, "package.json");
		if (existsSync(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
				const cloudflareConfig = packageJson.cloudflare;
				if (!cloudflareConfig || cloudflareConfig.publish !== true) {
					unpublishedTemplates.push(`**/${templateDir}.spec.ts`);
				}
			} catch (error) {
				// If we can't parse package.json, exclude the template from live tests
				unpublishedTemplates.push(`**/${templateDir}.spec.ts`);
			}
		} else {
			// If no package.json, exclude from live tests
			unpublishedTemplates.push(`**/${templateDir}.spec.ts`);
		}
	}

	return unpublishedTemplates;
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: "./playwright-tests",
	/* Run tests in files in parallel */
	fullyParallel: process.env.PLAYWRIGHT_USE_LIVE === "true", // Enable parallel for live URLs
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,
	/* Ignore these files when running against live mode */
	testIgnore: getTestIgnorePatterns(),
	/* Limit workers to avoid port conflicts, but allow more for live URLs */
	workers: process.env.PLAYWRIGHT_USE_LIVE === "true" ? 4 : 1, // Always use 1 worker for local dev to prevent port conflicts
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: "html",
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: "on-first-retry",
		/* Increase timeout for template server startup, reduce for live URLs */
		actionTimeout: process.env.PLAYWRIGHT_USE_LIVE === "true" ? 5000 : 10000,
		navigationTimeout:
			process.env.PLAYWRIGHT_USE_LIVE === "true" ? 15000 : 30000,
	},
	/* Global timeout for tests */
	timeout: process.env.PLAYWRIGHT_USE_LIVE === "true" ? 30000 : 60000,

	/* Configure projects for major browsers */
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},

		// {
		//   name: 'firefox',
		//   use: { ...devices['Desktop Firefox'] },
		// },

		// {
		//   name: 'webkit',
		//   use: { ...devices['Desktop Safari'] },
		// },

		/* Test against mobile viewports. */
		// {
		//   name: 'Mobile Chrome',
		//   use: { ...devices['Pixel 5'] },
		// },
		// {
		//   name: 'Mobile Safari',
		//   use: { ...devices['iPhone 12'] },
		// },

		/* Test against branded browsers. */
		// {
		//   name: 'Microsoft Edge',
		//   use: { ...devices['Desktop Edge'], channel: 'msedge' },
		// },
		// {
		//   name: 'Google Chrome',
		//   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
		// },
	],

	/* Run your local dev server before starting the tests */
	// webServer: {
	//   command: 'npm run start',
	//   url: 'http://localhost:3000',
	//   reuseExistingServer: !process.env.CI,
	// },
});

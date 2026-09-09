import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		exclude: [
			"node_modules/**",
			"dist/**",
			".wrangler/**",
			".worktrees/**",
			// Playwright owns the e2e specs — keep Vitest out of them.
			"playwright-tests/**",
		],
	},
});

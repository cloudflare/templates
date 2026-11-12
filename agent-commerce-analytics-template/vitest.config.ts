import { cloudflareTest } from "@cloudflare/vitest-plugin";

import { defineConfig } from "vite-plus";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: "./wrangler.jsonc",
			},
			miniflare: {
				// Enable the destructive DELETE /api/events endpoint for tests.
				// In production this is set with `wrangler secret put ADMIN_TOKEN`
				// and omitted from wrangler.jsonc.
				bindings: {
					ADMIN_TOKEN: "test-admin-token",
				},
			},
		}),
	],

	test: {
		testTimeout: 60000,
	},
});

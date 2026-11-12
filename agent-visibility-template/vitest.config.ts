import { cloudflareTest } from "@cloudflare/vitest-plugin";

import { defineConfig } from "vite-plus";

export default defineConfig({
	plugins: [
		cloudflareTest({
			remoteBindings: false,
			wrangler: {
				configPath: "./wrangler.jsonc",
			},
			miniflare: {
				// Provide the admin secret for the mutating-route tests.
				bindings: { ADMIN_TOKEN: "test-token" },
			},
		}),
	],

	test: {
		testTimeout: 60000,
	},
});

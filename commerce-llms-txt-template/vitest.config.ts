import { cloudflareTest } from "@cloudflare/vitest-plugin";

import { defineConfig } from "vite-plus";

export default defineConfig({
	plugins: [
		cloudflareTest({
			remoteBindings: false,
			wrangler: {
				configPath: "./wrangler.json",
			},
		}),
	],

	test: {
		testTimeout: 60000,
	},
});

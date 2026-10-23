import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: "./wrangler.jsonc",
			},
		}),
	],
	test: {
		// The first test in a worker compiles and instantiates the ~7.6 MB
		// layout engine WASM, so give the pool a generous timeout.
		testTimeout: 60000,
	},
});

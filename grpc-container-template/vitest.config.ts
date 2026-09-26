import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			remoteBindings: false,
			wrangler: {
				// Unit tests exercise handler shape and the plain-text status response,
				// so this config excludes Containers and does not require Docker.
				configPath: "./wrangler.test.jsonc",
			},
		}),
	],
	test: {
		include: ["test/**/*.spec.ts"],
	},
});

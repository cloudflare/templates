import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			remoteBindings: false,
			wrangler: {
				// Unit tests only exercise the HTTP handler, so this configuration
				// excludes Containers and the raw TCP trigger and does not need Docker.
				configPath: "./wrangler.test.jsonc",
			},
		}),
	],
	test: {
		include: ["test/**/*.spec.ts"],
	},
});

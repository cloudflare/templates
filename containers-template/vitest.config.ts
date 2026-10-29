import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
	plugins: [
		cloudflareTest({
			remoteBindings: false,
			wrangler: { configPath: "./wrangler.test.jsonc" },
		}),
	],
	test: { include: ["test/**/*.spec.ts"] },
});

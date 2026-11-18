import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

process.env.SEND_EMAIL_AUTH_TOKEN ??= "test-email-sending-token";

export default defineConfig({
	plugins: [
		cloudflareTest({
			remoteBindings: false,
			wrangler: {
				configPath: "./wrangler.e2e.jsonc",
			},
		}),
	],
	test: {
		include: ["test/**/*.test.ts"],
	},
});

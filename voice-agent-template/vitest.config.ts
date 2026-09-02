import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

process.env.VOICE_AGENT_TOKEN ??= "test-voice-agent-token";

export default defineConfig({
	plugins: [
		cloudflareTest({
			remoteBindings: false,
			wrangler: {
				configPath: "./wrangler.jsonc",
			},
			miniflare: {
				bindings: {
					VOICE_AGENT_TOKEN: "test-voice-agent-token",
				},
			},
		}),
	],
	test: {
		include: ["test/**/*.test.ts"],
	},
});

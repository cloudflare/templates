import path from "node:path";
import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations(
	path.join(import.meta.dirname, "migrations"),
);

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: { bindings: { MIGRATIONS: migrations } },
		}),
	],
	test: {
		setupFiles: ["./test/apply-migrations.ts"],
	},
});

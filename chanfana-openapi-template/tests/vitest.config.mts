import path from "node:path";
import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrationsPath = path.join(__dirname, "..", "migrations");
const migrations = await readD1Migrations(migrationsPath);

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: "./wrangler.jsonc",
			},
			miniflare: {
				compatibilityFlags: ["experimental", "nodejs_compat"],
				bindings: {
					MIGRATIONS: migrations,
				},
			},
		}),
	],
	esbuild: {
		target: "esnext",
	},
	test: {
		setupFiles: ["./tests/apply-migrations.ts"],
	},
});

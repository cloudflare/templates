import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Node.js environment
		environment: "node",
		include: ["cli/**/*.test.ts"],
	},
});

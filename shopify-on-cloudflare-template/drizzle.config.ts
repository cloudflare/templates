import type { Config } from "drizzle-kit";

export default {
	schema: "./src/db/schema.ts",
	out: "./drizzle/migrations",
	dialect: "sqlite",
	driver: "d1-http",
} satisfies Config;

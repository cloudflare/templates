import { applyD1Migrations, env } from "cloudflare:test";

// Migration setup runs outside isolated test storage, so it is safe to call once per test file.
await applyD1Migrations(env.JOBS, env.MIGRATIONS);

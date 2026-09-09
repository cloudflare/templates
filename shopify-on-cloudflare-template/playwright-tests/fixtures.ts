import { test as base } from "@playwright/test";

/**
 * Minimal local stand-in for the cloudflare/templates monorepo `fixtures.ts`.
 *
 * The monorepo version starts a per-template dev server and exposes its URL as
 * the `templateUrl` fixture. Locally we rely on the `webServer` block in
 * `playwright.config.ts` (which runs `npm run dev` on :5173) and simply surface
 * its `baseURL`. Keeping the same fixture surface means the `.spec.ts` file is
 * byte-for-byte portable into the monorepo's `playwright-tests/` directory.
 */
export interface TemplateFixtures {
	templateUrl: string;
}

export const test = base.extend<TemplateFixtures>({
	templateUrl: async ({ baseURL }, use) => {
		await use(baseURL ?? "http://localhost:5173");
	},
});

export { expect } from "@playwright/test";

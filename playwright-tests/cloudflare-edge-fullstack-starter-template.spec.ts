// Smoke test for the cloudflare/templates gallery.
//
// This file is written to drop into the `cloudflare/templates` monorepo at
// playwright-tests/cloudflare-edge-fullstack-starter-template.spec.ts when
// submitting to the gallery. The `./fixtures` import (which provides the
// `templateUrl` fixture — it builds + serves the template and hands back its
// URL) lives at the monorepo root, not in this repo. See
// https://github.com/cloudflare/templates/blob/main/CONTRIBUTING.md
//
// The flow exercises all three primitives end-to-end: sign up (auth → KV +
// D1), then create a note (D1). Email verification is off in this template, so
// sign-up signs the user straight in — no inbox needed in CI.

import { test, expect } from "./fixtures";

test.describe("Edge Full-Stack Starter", () => {
	test("signs up and creates a note", async ({ page, templateUrl }) => {
		// Unauthenticated landing redirects to the sign-in screen.
		await page.goto(templateUrl);
		await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

		// Go to sign-up and create a fresh account.
		const email = `e2e-${Date.now()}@example.com`;
		await page.getByRole("link", { name: "Create one" }).click();
		await expect(
			page.getByRole("heading", { name: "Create account" }),
		).toBeVisible();
		await page.getByLabel("Name").fill("E2E Tester");
		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Password").fill("supersecret123");
		await page.getByRole("button", { name: "Create account" }).click();

		// Landed in the app — the composer is visible.
		const composer = page.getByPlaceholder("Write a note…");
		await expect(composer).toBeVisible();

		// Create a note and see it appear in the list.
		const noteText = `playwright note ${Date.now()}`;
		await composer.fill(noteText);
		await page.getByRole("button", { name: "Add note" }).click();
		await expect(page.getByText(noteText)).toBeVisible();
	});
});

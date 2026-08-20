import { expect, test } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("every template with a dev server has an E2E spec", () => {
	const root = process.cwd();
	const missingSpecs = readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name.endsWith("-template"))
		.filter((entry) => {
			const packagePath = join(root, entry.name, "package.json");
			if (!existsSync(packagePath)) return false;
			const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
				scripts?: { dev?: string };
			};
			return Boolean(packageJson.scripts?.dev);
		})
		.map((entry) => entry.name)
		.filter(
			(templateName) =>
				!existsSync(join(root, "playwright-tests", `${templateName}.spec.ts`)),
		)
		.sort();

	expect(missingSpecs, "templates missing E2E specs").toEqual([]);
});

import { test as base } from "@playwright/test";
import { templateServerManager, Template } from "./utils/template-server";

export interface TemplateFixtures {
	templateUrl: string;
	template: Template;
}

// Track which test file is currently running to know when to clean up
let currentTestFile: string | null = null;
let currentServerUrl: string | null = null;

export const test = base.extend<TemplateFixtures>({
	templateUrl: async ({ template }, use, testInfo) => {
		const testFile = testInfo.file;

		// If this is a different test file, stop the previous server first
		if (currentTestFile && currentTestFile !== testFile) {
			console.log(
				`Switching from ${currentTestFile} to ${testFile}, stopping all servers...`,
			);
			await templateServerManager.stopAllServers();
			currentServerUrl = null;
			currentTestFile = null;

			// Wait for port to be fully released
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}

		// Start server for this template if not already running
		if (!currentServerUrl || currentTestFile !== testFile) {
			currentServerUrl = await templateServerManager.startServer(template.name);
			currentTestFile = testFile;
		}

		await use(currentServerUrl);
	},

	template: async ({}, use, testInfo) => {
		// Extract template name from test file name
		const testFileName = testInfo.file.split("/").pop() || "";
		const templateName = testFileName.replace(".spec.ts", "");

		const template = templateServerManager.getTemplate(templateName);
		if (!template) {
			throw new Error(
				`Template ${templateName} not found. Make sure test file is named like 'template-name.spec.ts'`,
			);
		}

		await use(template);
	},
});

// Clean up servers when process exits
process.on("exit", async () => {
	await templateServerManager.stopAllServers();
});

process.on("SIGINT", async () => {
	await templateServerManager.stopAllServers();
	process.exit(0);
});

export { expect } from "@playwright/test";

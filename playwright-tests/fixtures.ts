import { test as base } from "@playwright/test";
import { Template, TemplateServerManager } from "./utils/template-server";

export interface TemplateFixtures {
	templateUrl: string;
	template: Template;
}

interface TemplateWorkerFixtures {
	templateServerManager: TemplateServerManager;
}

// These values are scoped to a Playwright worker process. Local tests use one
// worker so templates can share a server within a spec without port conflicts.
let currentTestFile: string | null = null;
let currentServerUrl: string | null = null;

export const test = base.extend<TemplateFixtures, TemplateWorkerFixtures>({
	templateServerManager: [
		async ({}, use) => {
			const manager = new TemplateServerManager();
			try {
				await use(manager);
			} finally {
				await manager.stopAllServers();
				currentTestFile = null;
				currentServerUrl = null;
			}
		},
		{ scope: "worker" },
	],

	templateUrl: async ({ template, templateServerManager }, use, testInfo) => {
		const testFile = testInfo.file;

		if (currentTestFile && currentTestFile !== testFile) {
			console.log(
				`Switching from ${currentTestFile} to ${testFile}, stopping all servers...`,
			);
			await templateServerManager.stopAllServers();
			currentServerUrl = null;
			currentTestFile = null;
		}

		if (!currentServerUrl || currentTestFile !== testFile) {
			currentServerUrl = await templateServerManager.startServer(template.name);
			currentTestFile = testFile;
		}

		await use(currentServerUrl);

		if (testInfo.status !== testInfo.expectedStatus) {
			const logs = templateServerManager.getServerLogs(template.name);
			if (logs) {
				await testInfo.attach(`${template.name}-server.log`, {
					body: Buffer.from(logs),
					contentType: "text/plain",
				});
			}
		}
	},

	template: async ({ templateServerManager }, use, testInfo) => {
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

export { expect } from "@playwright/test";

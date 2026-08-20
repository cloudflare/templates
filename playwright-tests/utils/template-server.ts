import { spawn, type ChildProcess } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	readdirSync,
	readFileSync,
	unlinkSync,
} from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import fetch from "node-fetch";

// Helper function to kill the complete process tree without leaving dev servers
// behind between Playwright runs.
async function killProcessTree(pid: number): Promise<void> {
	if (process.platform === "win32") {
		await new Promise<void>((resolve) => {
			const taskkill = spawn("taskkill", ["/pid", pid.toString(), "/T", "/F"], {
				stdio: "ignore",
			});
			taskkill.once("close", () => resolve());
			taskkill.once("error", () => resolve());
		});
		return;
	}

	const processGroupExists = () => {
		try {
			process.kill(-pid, 0);
			return true;
		} catch {
			return false;
		}
	};

	try {
		process.kill(-pid, "SIGTERM");
	} catch {
		return;
	}
	for (let attempt = 0; attempt < 20 && processGroupExists(); attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	if (processGroupExists()) {
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			// Process group exited between the liveness check and signal.
		}
	}
}

export interface Template {
	name: string;
	path: string;
	devCommand: string;
	devScript: "dev" | "e2e:dev";
	healthCheckPath?: string;
}

type TemplatePackageJson = {
	scripts?: Record<string, string>;
	cloudflare?: {
		publish?: boolean;
		healthCheckPath?: string;
	};
};

type RunningServer = {
	process: ChildProcess;
	url: string;
	logs: string[];
	createdEnvFiles: string[];
};

export class TemplateServerManager {
	private servers: Map<string, RunningServer> = new Map();
	private templates: Template[] = [];
	private useLiveUrls: boolean = false;

	constructor() {
		// Check if we should use live URLs from environment variable
		this.useLiveUrls = process.env.PLAYWRIGHT_USE_LIVE === "true";
		this.discoverTemplates();
	}

	private discoverTemplates(): void {
		const templatesRoot = process.cwd();

		const templateDirs = readdirSync(templatesRoot, { withFileTypes: true })
			.filter(
				(entry) => entry.isDirectory() && entry.name.endsWith("-template"),
			)
			.map((entry) => entry.name);

		for (const templateDir of templateDirs) {
			const templatePath = join(templatesRoot, templateDir);
			const packageJsonPath = join(templatePath, "package.json");

			if (existsSync(packageJsonPath)) {
				try {
					const packageJson = JSON.parse(
						readFileSync(packageJsonPath, "utf8"),
					) as TemplatePackageJson;

					// For live tests, only include templates with cloudflare.publish === true
					if (this.useLiveUrls) {
						const cloudflareConfig = packageJson.cloudflare;
						if (!cloudflareConfig || cloudflareConfig.publish !== true) {
							continue;
						}
					}

					const template = this.analyzeTemplate(
						templateDir,
						templatePath,
						packageJson,
					);
					if (template) {
						this.templates.push(template);
					}
				} catch (error) {
					console.warn(
						`Failed to parse package.json for ${templateDir}:`,
						error,
					);
				}
			}
		}
	}

	private analyzeTemplate(
		name: string,
		path: string,
		packageJson: TemplatePackageJson,
	): Template | null {
		const scripts = packageJson.scripts ?? {};

		if (!scripts.dev) {
			console.warn(`Template ${name} has no dev script, skipping`);
			return null;
		}

		const e2eDevCommand = scripts["e2e:dev"];
		return {
			name,
			path,
			devCommand: e2eDevCommand ?? scripts.dev,
			devScript: e2eDevCommand ? "e2e:dev" : "dev",
			healthCheckPath: packageJson.cloudflare?.healthCheckPath,
		};
	}

	async startServer(templateName: string): Promise<string> {
		const template = this.templates.find((t) => t.name === templateName);
		if (!template) {
			throw new Error(`Template ${templateName} not found`);
		}

		// If using live URLs, return the live URL directly
		if (this.useLiveUrls) {
			const liveUrl = this.getLiveUrl(templateName);
			console.log(`Using live URL for ${templateName}: ${liveUrl}`);
			return liveUrl;
		}

		const runningServer = this.servers.get(templateName);
		if (runningServer) {
			console.log(`Server for ${templateName} already running`);
			return runningServer.url;
		}

		const port = await this.getAvailablePort();
		console.log(`Starting server for ${template.name} on port ${port}...`);

		// Copy example env files if they exist. Files created by the test harness
		// are removed when the server stops.
		const createdEnvFiles = this.copyEnvFiles(template.path);

		const devArgs = ["run", template.devScript, "--port", port.toString()];
		if (template.devCommand.includes("wrangler")) {
			devArgs.push(
				"--inspector-port",
				(await this.getAvailablePort()).toString(),
			);
		}
		const server = spawn(
			process.platform === "win32" ? "pnpm.cmd" : "pnpm",
			devArgs,
			{
				cwd: template.path,
				stdio: "pipe",
				detached: process.platform !== "win32",
				env: {
					...process.env,
					NEXT_TELEMETRY_DEBUG: "1",
					NEXT_TELEMETRY_DISABLED: "1",
					WRANGLER_SEND_METRICS: "false",
				},
			},
		);
		const logs: string[] = [];
		const appendLog = (chunk: unknown) => {
			logs.push(String(chunk));
			if (logs.length > 200) logs.shift();
		};
		for (const stream of [server.stdout, server.stderr]) {
			stream?.on("data", appendLog);
		}
		server.on("error", appendLog);

		const baseUrl = `http://localhost:${port}`;
		this.servers.set(templateName, {
			process: server,
			url: baseUrl,
			logs,
			createdEnvFiles,
		});

		// Wait for server to be ready
		const healthCheckUrl = template.healthCheckPath
			? `${baseUrl}${template.healthCheckPath}`
			: baseUrl;
		try {
			await this.waitForServer(healthCheckUrl, server, logs, 30000);
		} catch (error) {
			await this.stopServer(templateName);
			throw error;
		}

		console.log(`Server for ${template.name} ready at ${baseUrl}`);
		return baseUrl;
	}

	private getLiveUrl(templateName: string): string {
		const template = this.templates.find((item) => item.name === templateName);
		if (!template) throw new Error(`Template ${templateName} not found`);

		try {
			const configPath = [
				join(template.path, "wrangler.jsonc"),
				join(template.path, "wrangler.json"),
			].find(existsSync);
			if (!configPath) {
				throw new Error(`No wrangler.json found for ${templateName}`);
			}
			const config = readFileSync(configPath, "utf8");
			const wranglerName = config.match(/"name"\s*:\s*"([^"]+)"/)?.[1];
			if (!wranglerName) {
				throw new Error(`No name found in wrangler config for ${templateName}`);
			}
			return `https://${wranglerName}.templates.workers.dev`;
		} catch {
			console.warn(
				`Could not determine live URL for ${templateName}, falling back to template name`,
			);
			return `https://${templateName}.templates.workers.dev`;
		}
	}

	async stopServer(templateName: string): Promise<void> {
		// If using live URLs, no need to stop anything
		if (this.useLiveUrls) {
			return;
		}

		const runningServer = this.servers.get(templateName);
		if (!runningServer) return;

		if (runningServer.process.pid) {
			console.log(
				`Stopping server for ${templateName} (PID: ${runningServer.process.pid})...`,
			);
			await killProcessTree(runningServer.process.pid);
		}
		this.servers.delete(templateName);
		for (const envFile of runningServer.createdEnvFiles) {
			try {
				unlinkSync(envFile);
			} catch {
				// The server or test may have already removed the temporary file.
			}
		}
	}

	async stopAllServers(): Promise<void> {
		const promises = Array.from(this.servers.keys()).map((name) =>
			this.stopServer(name),
		);
		await Promise.all(promises);
	}

	private copyEnvFiles(templatePath: string): string[] {
		const envFileMappings = [
			{ example: ".dev.vars.example", target: ".dev.vars" },
			{ example: ".env.local.example", target: ".env.local" },
		];

		const createdFiles: string[] = [];
		for (const { example, target } of envFileMappings) {
			const examplePath = join(templatePath, example);
			const targetPath = join(templatePath, target);

			if (existsSync(examplePath) && !existsSync(targetPath)) {
				copyFileSync(examplePath, targetPath);
				createdFiles.push(targetPath);
				console.log(`Copied ${example} to ${target}`);
			}
		}
		return createdFiles;
	}

	private async getAvailablePort(): Promise<number> {
		return new Promise((resolve, reject) => {
			const server = createServer();
			server.unref();
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => {
				const address = server.address();
				if (!address || typeof address === "string") {
					server.close();
					reject(new Error("Unable to allocate a local port"));
					return;
				}
				server.close((error) =>
					error ? reject(error) : resolve(address.port),
				);
			});
		});
	}

	private async waitForServer(
		url: string,
		server: ChildProcess,
		logs: string[],
		timeout: number,
	): Promise<void> {
		const start = Date.now();

		while (Date.now() - start < timeout) {
			if (server.exitCode !== null) {
				throw new Error(
					`Server process exited with code ${server.exitCode}.\n${logs.join("")}`,
				);
			}
			try {
				const response = await fetch(url, {
					signal: AbortSignal.timeout(2000),
				});
				if (response.ok) {
					return;
				}
			} catch (error) {
				// Server not ready yet
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		throw new Error(
			`Server at ${url} did not become ready within ${timeout}ms.\n${logs.join("")}`,
		);
	}

	getTemplates(): Template[] {
		return [...this.templates];
	}

	getTemplate(name: string): Template | undefined {
		return this.templates.find((t) => t.name === name);
	}

	getServerLogs(name: string): string {
		return this.servers.get(name)?.logs.join("") ?? "";
	}
}

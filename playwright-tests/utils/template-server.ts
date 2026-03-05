import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { existsSync, copyFileSync } from "fs";
import fetch from "node-fetch";

// Helper function to kill process tree
async function killProcessTree(pid: number): Promise<void> {
	if (process.platform === "win32") {
		// Windows
		spawn("taskkill", ["/pid", pid.toString(), "/T", "/F"], {
			stdio: "ignore",
		});
	} else {
		// Unix-like (macOS, Linux)
		try {
			process.kill(-pid, "SIGTERM");
			await new Promise((resolve) => setTimeout(resolve, 2000));
			process.kill(-pid, "SIGKILL");
		} catch (error) {
			// Process might already be dead
		}
	}
}

export interface Template {
	name: string;
	path: string;
	port: number;
	devCommand: string;
	framework: "vite" | "next" | "astro" | "remix" | "wrangler" | "react-router";
	healthCheckPath?: string; // Optional custom path for server readiness check
}

export class TemplateServerManager {
	private servers: Map<string, ChildProcess> = new Map();
	private templates: Template[] = [];
	private useLiveUrls: boolean = false;

	constructor() {
		// Check if we should use live URLs from environment variable
		this.useLiveUrls = process.env.PLAYWRIGHT_USE_LIVE === "true";
		this.discoverTemplates();
	}

	private discoverTemplates(): void {
		const fs = require("fs");
		const templatesRoot = join(process.cwd());

		// Get all directories ending with -template
		const entries = fs.readdirSync(templatesRoot, { withFileTypes: true });
		const templateDirs = entries
			.filter(
				(entry: any) => entry.isDirectory() && entry.name.endsWith("-template"),
			)
			.map((entry: any) => entry.name);

		for (const templateDir of templateDirs) {
			const templatePath = join(templatesRoot, templateDir);
			const packageJsonPath = join(templatePath, "package.json");

			if (fs.existsSync(packageJsonPath)) {
				try {
					const packageJson = JSON.parse(
						fs.readFileSync(packageJsonPath, "utf8"),
					);

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
		packageJson: any,
	): Template | null {
		const scripts = packageJson.scripts || {};
		const dependencies = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		if (!scripts.dev) {
			console.warn(`Template ${name} has no dev script, skipping`);
			return null;
		}

		// Determine framework and default port
		let framework: Template["framework"] = "wrangler";
		let port = 8787; // Default wrangler port

		if (dependencies["vite"] || scripts.dev.includes("vite")) {
			framework = "vite";
			port = 5173;
		} else if (dependencies["next"] || scripts.dev.includes("next")) {
			framework = "next";
			port = 3000;
		} else if (dependencies["astro"] || scripts.dev.includes("astro")) {
			framework = "astro";
			port = 4321;
		} else if (
			dependencies["@remix-run/dev"] ||
			scripts.dev.includes("remix")
		) {
			framework = "remix";
			port = 5173;
		} else if (
			dependencies["@react-router/dev"] ||
			scripts.dev.includes("react-router")
		) {
			framework = "react-router";
			port = 5173;
		}

		// Check for custom health check path in cloudflare config
		const healthCheckPath = packageJson.cloudflare?.healthCheckPath;

		return {
			name,
			path,
			port,
			devCommand: scripts.dev,
			framework,
			healthCheckPath,
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

		if (this.servers.has(templateName)) {
			console.log(`Server for ${templateName} already running`);
			return `http://localhost:${template.port}`;
		}

		console.log(
			`Starting server for ${template.name} on port ${template.port}...`,
		);

		// Copy example env files if they exist
		this.copyEnvFiles(template.path);

		const server = spawn("npm", ["run", "dev"], {
			cwd: template.path,
			stdio: "pipe",
			shell: true,
			detached: true, // Create a new process group
		});

		this.servers.set(templateName, server);

		// Wait for server to be ready
		const baseUrl = `http://localhost:${template.port}`;
		const healthCheckUrl = template.healthCheckPath
			? `${baseUrl}${template.healthCheckPath}`
			: baseUrl;
		await this.waitForServer(healthCheckUrl, 30000); // 30 second timeout

		console.log(`Server for ${template.name} ready at ${baseUrl}`);
		return baseUrl;
	}

	private getLiveUrl(templateName: string): string {
		// Get the wrangler name from the template's wrangler.json
		const fs = require("fs");
		const template = this.templates.find((t) => t.name === templateName);
		if (!template) {
			throw new Error(`Template ${templateName} not found`);
		}

		try {
			const wranglerPath = join(template.path, "wrangler.json");
			const wranglerJsoncPath = join(template.path, "wrangler.jsonc");

			let wranglerConfig;
			if (fs.existsSync(wranglerPath)) {
				wranglerConfig = JSON.parse(fs.readFileSync(wranglerPath, "utf8"));
			} else if (fs.existsSync(wranglerJsoncPath)) {
				// Simple JSONC parser - remove comments and parse
				const content = fs.readFileSync(wranglerJsoncPath, "utf8");
				const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
				wranglerConfig = JSON.parse(jsonContent);
			} else {
				throw new Error(`No wrangler.json found for ${templateName}`);
			}

			const wranglerName = wranglerConfig.name;
			if (!wranglerName) {
				throw new Error(`No name found in wrangler config for ${templateName}`);
			}

			return `https://${wranglerName}.templates.workers.dev`;
		} catch (error) {
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

		const server = this.servers.get(templateName);
		if (server && server.pid) {
			console.log(
				`Stopping server for ${templateName} (PID: ${server.pid})...`,
			);

			// Kill the entire process tree
			await killProcessTree(server.pid);

			this.servers.delete(templateName);

			// Give it a moment to fully clean up
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	async stopAllServers(): Promise<void> {
		const promises = Array.from(this.servers.keys()).map((name) =>
			this.stopServer(name),
		);
		await Promise.all(promises);
	}

	private copyEnvFiles(templatePath: string): void {
		const envFileMappings = [
			{ example: ".dev.vars.example", target: ".dev.vars" },
			{ example: ".env.local.example", target: ".env.local" },
		];

		for (const { example, target } of envFileMappings) {
			const examplePath = join(templatePath, example);
			const targetPath = join(templatePath, target);

			if (existsSync(examplePath) && !existsSync(targetPath)) {
				copyFileSync(examplePath, targetPath);
				console.log(`Copied ${example} to ${target}`);
			}
		}
	}

	private async waitForServer(url: string, timeout: number): Promise<void> {
		const start = Date.now();

		while (Date.now() - start < timeout) {
			try {
				const response = await fetch(url);
				if (response.status < 500) {
					return; // Server is responding
				}
			} catch (error) {
				// Server not ready yet
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		throw new Error(
			`Server at ${url} did not become ready within ${timeout}ms`,
		);
	}

	private async runCommand(command: string, cwd: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const [cmd, ...args] = command.split(" ");
			const proc = spawn(cmd, args, { cwd, stdio: "inherit" });

			proc.on("close", (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`Command failed with code ${code}`));
				}
			});
		});
	}

	getTemplates(): Template[] {
		return [...this.templates];
	}

	getTemplate(name: string): Template | undefined {
		return this.templates.find((t) => t.name === name);
	}
}

// Global instance
export const templateServerManager = new TemplateServerManager();

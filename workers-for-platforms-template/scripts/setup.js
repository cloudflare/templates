#!/usr/bin/env node

/**
 * Workers for Platforms Template - Setup Script
 *
 * This script handles automated setup:
 * - Validates Cloudflare credentials
 * - Creates dispatch namespace for Workers for Platforms
 * - Auto-creates API tokens with correct permissions
 * - Generates .dev.vars file with all required secrets
 * - Updates wrangler.toml with routes and resource IDs
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const PROJECT_ROOT = path.join(__dirname, "..");

// Colors for console output
const colors = {
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	reset: "\x1b[0m",
	bold: "\x1b[1m",
};

function log(color, message) {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function logBold(color, message) {
	console.log(`${colors.bold}${colors[color]}${message}${colors.reset}`);
}

class SetupManager {
	constructor() {
		this.config = {};
		this.existingConfig = {};
		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
	}

	async setup() {
		console.log("");
		logBold(
			"cyan",
			"╔══════════════════════════════════════════════════════════════╗",
		);
		logBold(
			"cyan",
			"║     Workers for Platforms Template - Automated Setup         ║",
		);
		logBold(
			"cyan",
			"╚══════════════════════════════════════════════════════════════╝",
		);
		console.log("");

		try {
			// Load existing config
			this.loadExistingConfig();

			// Collect user configuration
			await this.collectUserConfig();

			// Validate credentials
			await this.validateCredentials();

			// Setup resources
			await this.setupResources();

			// Generate config files
			await this.generateDevVars();
			await this.updateWranglerConfig();

			// Display final report
			this.displayFinalReport();
		} catch (error) {
			log("red", `\n❌ Setup failed: ${error.message}`);
			log("yellow", "\n💡 Troubleshooting:");
			log("yellow", "   1. Verify your Cloudflare API credentials");
			log(
				"yellow",
				"   2. Ensure Workers for Platforms is enabled on your account",
			);
			log("yellow", "   3. Check API token has required permissions");
			process.exit(1);
		} finally {
			this.rl.close();
		}
	}

	async prompt(question) {
		return new Promise((resolve) => {
			this.rl.question(question, (answer) => {
				resolve(answer.trim());
			});
		});
	}

	async promptWithDefault(question, defaultValue) {
		if (defaultValue) {
			const masked = this.maskSensitiveValue(question, defaultValue);
			const answer = await this.prompt(`${question} [${masked}]: `);
			return answer || defaultValue;
		}
		return this.prompt(`${question}: `);
	}

	maskSensitiveValue(question, value) {
		const sensitivePatterns = ["TOKEN", "SECRET", "KEY", "PASSWORD"];
		const isSensitive = sensitivePatterns.some((pattern) =>
			question.toUpperCase().includes(pattern),
		);
		if (isSensitive && value.length > 8) {
			return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
		}
		return value;
	}

	loadExistingConfig() {
		const devVarsPath = path.join(PROJECT_ROOT, ".dev.vars");

		if (fs.existsSync(devVarsPath)) {
			log("blue", "📄 Found existing .dev.vars - loading configuration...");
			const content = fs.readFileSync(devVarsPath, "utf-8");

			content.split("\n").forEach((line) => {
				const trimmed = line.trim();
				if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
					const [key, ...valueParts] = trimmed.split("=");
					const value = valueParts.join("=").replace(/^["']|["']$/g, "");
					if (key && value) {
						this.existingConfig[key.trim()] = value;
					}
				}
			});

			const configCount = Object.keys(this.existingConfig).length;
			if (configCount > 0) {
				log("green", `✅ Loaded ${configCount} existing configuration values`);
				console.log("");
			}
		}
	}

	async collectUserConfig() {
		log("blue", "📋 Configuration Setup");
		log("blue", "──────────────────────\n");

		// Account ID
		this.config.accountId = await this.promptWithDefault(
			"Cloudflare Account ID",
			this.existingConfig.ACCOUNT_ID,
		);
		if (!this.config.accountId) {
			throw new Error(
				"Account ID is required. Find it at dash.cloudflare.com in the URL.",
			);
		}

		// API Token or Key
		log("yellow", "\n💡 You can use either:");
		log(
			"yellow",
			"   1. API Token (recommended) - Create at dash.cloudflare.com/profile/api-tokens",
		);
		log("yellow", "   2. Global API Key + Email\n");

		const authChoice = await this.prompt("Use API Token? (Y/n): ");

		if (authChoice.toLowerCase() !== "n") {
			this.config.apiToken = await this.promptWithDefault(
				"Cloudflare API Token",
				this.existingConfig.DISPATCH_NAMESPACE_API_TOKEN ||
					this.existingConfig.CLOUDFLARE_API_TOKEN,
			);
			if (!this.config.apiToken) {
				throw new Error("API Token is required");
			}
			this.config.authMethod = "token";
		} else {
			this.config.apiKey = await this.promptWithDefault(
				"Cloudflare Global API Key",
				this.existingConfig.CLOUDFLARE_API_KEY,
			);
			this.config.apiEmail = await this.promptWithDefault(
				"Cloudflare Account Email",
				this.existingConfig.CLOUDFLARE_API_EMAIL,
			);
			if (!this.config.apiKey || !this.config.apiEmail) {
				throw new Error("Both API Key and Email are required");
			}
			this.config.authMethod = "key";
		}

		// Custom Domain Configuration
		log("blue", "\n🌐 Custom Domain Configuration");
		log(
			"yellow",
			"   A custom domain enables branded URLs (e.g., site.platform.com)",
		);
		log("yellow", "   Without it, sites will use workers.dev subdomains\n");

		this.config.customDomain = await this.promptWithDefault(
			"Custom domain (optional, e.g., platform.com)",
			this.existingConfig.CUSTOM_DOMAIN,
		);

		if (
			this.config.customDomain &&
			this.config.customDomain !== "localhost:5173" &&
			this.config.customDomain !== ""
		) {
			// Try to auto-detect zone
			await this.detectZoneForDomain();

			if (!this.config.zoneId) {
				this.config.zoneId = await this.promptWithDefault(
					"Zone ID for custom domain",
					this.existingConfig.CLOUDFLARE_ZONE_ID,
				);
			}

			this.config.fallbackOrigin = await this.promptWithDefault(
				"Fallback origin hostname (e.g., my.platform.com)",
				this.existingConfig.FALLBACK_ORIGIN || `my.${this.config.customDomain}`,
			);

			if (this.config.fallbackOrigin) {
				log(
					"yellow",
					`\n💡 Customers will CNAME their domains to: ${this.config.fallbackOrigin}`,
				);
			}
		}

		console.log("");
		log("green", "✅ Configuration collected\n");
	}

	getAuthHeaders() {
		if (this.config.authMethod === "token") {
			return {
				Authorization: `Bearer ${this.config.apiToken}`,
				"Content-Type": "application/json",
			};
		} else {
			return {
				"X-Auth-Key": this.config.apiKey,
				"X-Auth-Email": this.config.apiEmail,
				"Content-Type": "application/json",
			};
		}
	}

	async validateCredentials() {
		log("blue", "🔐 Validating Cloudflare credentials...");

		try {
			const response = await fetch(
				"https://api.cloudflare.com/client/v4/user/tokens/verify",
				{
					headers: this.getAuthHeaders(),
				},
			);

			const data = await response.json();

			if (!response.ok || !data.success) {
				throw new Error(data.errors?.[0]?.message || "Invalid credentials");
			}

			log("green", "✅ Credentials validated successfully");

			// Get account info
			const accountResponse = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}`,
				{ headers: this.getAuthHeaders() },
			);

			const accountData = await accountResponse.json();
			if (accountData.success && accountData.result) {
				log("green", `✅ Connected to account: ${accountData.result.name}`);
				this.config.accountName = accountData.result.name;
			}
		} catch (error) {
			throw new Error(`Credential validation failed: ${error.message}`);
		}
	}

	async detectZoneForDomain() {
		if (!this.config.customDomain) return;

		log("blue", `🔍 Detecting zone for ${this.config.customDomain}...`);

		try {
			// Try to find zone by domain name
			const domainParts = this.config.customDomain.split(".");

			for (let i = 0; i < domainParts.length - 1; i++) {
				const zoneName = domainParts.slice(i).join(".");

				const response = await fetch(
					`https://api.cloudflare.com/client/v4/zones?name=${zoneName}&account.id=${this.config.accountId}`,
					{ headers: this.getAuthHeaders() },
				);

				const data = await response.json();

				if (data.success && data.result && data.result.length > 0) {
					const zone = data.result[0];
					log("green", `✅ Found zone: ${zone.name} (ID: ${zone.id})`);
					this.config.zoneId = zone.id;
					this.config.zoneName = zone.name;
					return;
				}
			}

			log(
				"yellow",
				`⚠️  Could not auto-detect zone for ${this.config.customDomain}`,
			);
		} catch (error) {
			log("yellow", `⚠️  Zone detection failed: ${error.message}`);
		}
	}

	async setupResources() {
		log("blue", "\n📦 Setting up Cloudflare resources...");

		// Check Workers for Platforms access
		await this.checkWorkersForPlatformsAccess();

		// Create dispatch namespace
		await this.ensureDispatchNamespace();

		// Always create a permanent API token for runtime use
		await this.ensureDispatchToken();
	}

	async checkWorkersForPlatformsAccess() {
		log("blue", "🔍 Checking Workers for Platforms access...");

		try {
			const response = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/workers/dispatch/namespaces`,
				{ headers: this.getAuthHeaders() },
			);

			const data = await response.json();

			if (
				response.status === 403 ||
				(data.errors && data.errors.some((e) => e.code === 10121))
			) {
				log(
					"yellow",
					"⚠️  Workers for Platforms is not enabled on this account",
				);
				log(
					"yellow",
					"   Purchase at: https://dash.cloudflare.com/?to=/:account/workers-for-platforms",
				);
				log("yellow", "   Enterprise: Contact your account team\n");
				this.config.wfpAvailable = false;
			} else if (response.ok) {
				log("green", "✅ Workers for Platforms is available");
				this.config.wfpAvailable = true;
				this.config.existingNamespaces = data.result || [];
			} else {
				log(
					"yellow",
					`⚠️  Could not verify Workers for Platforms access: ${data.errors?.[0]?.message}`,
				);
				this.config.wfpAvailable = false;
			}
		} catch (error) {
			log(
				"yellow",
				`⚠️  Could not check Workers for Platforms: ${error.message}`,
			);
			this.config.wfpAvailable = false;
		}
	}

	async ensureDispatchNamespace() {
		const namespaceName = "workers-platform-template";

		if (!this.config.wfpAvailable) {
			log(
				"yellow",
				`⚠️  Skipping dispatch namespace creation (Workers for Platforms not available)`,
			);
			return;
		}

		log("blue", `📦 Ensuring dispatch namespace '${namespaceName}' exists...`);

		// Check if already exists
		const existing = this.config.existingNamespaces?.find(
			(ns) => ns.name === namespaceName,
		);
		if (existing) {
			log("green", `✅ Dispatch namespace '${namespaceName}' already exists`);
			this.config.dispatchNamespaceId = existing.id;
			return;
		}

		// Create namespace
		try {
			const response = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/workers/dispatch/namespaces`,
				{
					method: "POST",
					headers: this.getAuthHeaders(),
					body: JSON.stringify({ name: namespaceName }),
				},
			);

			const data = await response.json();

			if (response.ok && data.success) {
				log("green", `✅ Created dispatch namespace '${namespaceName}'`);
				this.config.dispatchNamespaceId = data.result.id;
			} else if (
				data.errors?.some((e) => e.message?.includes("already exists"))
			) {
				log("green", `✅ Dispatch namespace '${namespaceName}' already exists`);
			} else {
				log(
					"yellow",
					`⚠️  Could not create dispatch namespace: ${data.errors?.[0]?.message}`,
				);
			}
		} catch (error) {
			log(
				"yellow",
				`⚠️  Could not create dispatch namespace: ${error.message}`,
			);
		}
	}

	async ensureDispatchToken() {
		log("blue", "🔐 Creating permanent API token for runtime operations...");

		try {
			// If using existing token, test if it has permissions
			if (this.config.authMethod === "token") {
				const testResponse = await fetch(
					`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/workers/dispatch/namespaces`,
					{ headers: this.getAuthHeaders() },
				);

				if (testResponse.ok) {
					log("green", "✅ Current token has dispatch namespace permissions");
					this.config.dispatchToken = this.config.apiToken;
					return;
				}
			}

			// Create a new permanent token (works with both API Token and Global API Key)
			log("blue", "🔐 Creating specialized dispatch namespace token...");

			const tokenResponse = await fetch(
				"https://api.cloudflare.com/client/v4/user/tokens",
				{
					method: "POST",
					headers: this.getAuthHeaders(),
					body: JSON.stringify({
						name: `Workers Platform Template Token - ${new Date().toISOString().split("T")[0]}`,
						policies: [
							{
								effect: "allow",
								resources: {
									[`com.cloudflare.api.account.${this.config.accountId}`]: "*",
								},
								permission_groups: [
									{
										id: "c1fde68c7bcc44588cbb6ddbc16d6480",
										name: "Account Settings Read",
									},
									{
										id: "1a71c399035b4950a1bd1466bbe4f420",
										name: "Workers Scripts Write",
									},
									{
										id: "e086da7e2179491d91ee5f35b3ca210a",
										name: "Workers Scripts Read",
									},
								],
							},
						],
						condition: {},
						expires_on: new Date(
							Date.now() + 365 * 24 * 60 * 60 * 1000,
						).toISOString(),
					}),
				},
			);

			const tokenData = await tokenResponse.json();

			if (tokenResponse.ok && tokenData.success && tokenData.result?.value) {
				log("green", "✅ Created permanent API token");
				log("yellow", `   Token ID: ${tokenData.result.id}`);
				this.config.dispatchToken = tokenData.result.value;
				this.config.createdToken = true;
			} else {
				log(
					"yellow",
					`⚠️  Could not create token: ${tokenData.errors?.[0]?.message}`,
				);
				if (this.config.authMethod === "token") {
					log(
						"yellow",
						"   Using existing token - may need manual permission setup",
					);
					this.config.dispatchToken = this.config.apiToken;
				} else {
					log(
						"red",
						"❌ Cannot create API token - Global API Key cannot be used at runtime",
					);
					log("yellow", "   Please use an API Token instead of Global API Key");
				}
			}
		} catch (error) {
			log("yellow", `⚠️  Token setup error: ${error.message}`);
			if (this.config.authMethod === "token") {
				this.config.dispatchToken = this.config.apiToken;
			}
		}
	}

	async generateDevVars() {
		log("blue", "\n📝 Generating .dev.vars file...");

		const devVarsPath = path.join(PROJECT_ROOT, ".dev.vars");

		let content = `# Workers for Platforms Template - Environment Variables
# Generated by setup script on ${new Date().toISOString()}

# Cloudflare Account Configuration
ACCOUNT_ID="${this.config.accountId}"
`;

		// Always use API token format - the setup script will create a permanent token
		content += `
# API Token for dispatch namespace operations (auto-created with correct permissions)
DISPATCH_NAMESPACE_API_TOKEN="${this.config.dispatchToken || this.config.apiToken}"
`;

		if (this.config.customDomain && this.config.customDomain !== "") {
			content += `
# Custom Domain Configuration
CUSTOM_DOMAIN="${this.config.customDomain}"
`;
			if (this.config.zoneId) {
				content += `CLOUDFLARE_ZONE_ID="${this.config.zoneId}"
`;
			}
			if (this.config.fallbackOrigin) {
				content += `FALLBACK_ORIGIN="${this.config.fallbackOrigin}"
`;
			}
		}

		// Preserve any additional existing variables
		const preserveVars = ["JWT_SECRET", "WEBHOOK_SECRET"];
		for (const varName of preserveVars) {
			if (this.existingConfig[varName]) {
				content += `${varName}="${this.existingConfig[varName]}"
`;
			}
		}

		fs.writeFileSync(devVarsPath, content, "utf-8");
		log("green", "✅ .dev.vars file created");
	}

	async updateWranglerConfig() {
		log("blue", "🔧 Updating wrangler.toml...");

		const wranglerPath = path.join(PROJECT_ROOT, "wrangler.toml");

		if (!fs.existsSync(wranglerPath)) {
			log("yellow", "⚠️  wrangler.toml not found");
			return;
		}

		let content = fs.readFileSync(wranglerPath, "utf-8");

		// Update vars section
		if (this.config.customDomain && this.config.customDomain !== "") {
			content = content.replace(
				/CUSTOM_DOMAIN = ".*"/,
				`CUSTOM_DOMAIN = "${this.config.customDomain}"`,
			);

			// Set workers_dev = false for custom domain
			content = content.replace(/workers_dev = true/, "workers_dev = false");
		}

		if (this.config.zoneId) {
			content = content.replace(
				/CLOUDFLARE_ZONE_ID = ".*"/,
				`CLOUDFLARE_ZONE_ID = "${this.config.zoneId}"`,
			);
		}

		if (this.config.fallbackOrigin) {
			content = content.replace(
				/FALLBACK_ORIGIN = ".*"/,
				`FALLBACK_ORIGIN = "${this.config.fallbackOrigin}"`,
			);
		}

		// Add routes if custom domain is configured
		if (
			this.config.customDomain &&
			this.config.customDomain !== "" &&
			this.config.zoneId
		) {
			// Remove any existing routes section
			content = content.replace(
				/\n# Routes for custom domain\nroutes = \[[\s\S]*?\]\n/g,
				"",
			);

			// Add new routes section before [vars] or at the end
			const routesSection = `
# Routes for custom domain
routes = [
  { pattern = "${this.config.customDomain}/*", zone_id = "${this.config.zoneId}" },
  { pattern = "*.${this.config.customDomain}/*", zone_id = "${this.config.zoneId}" }
]
`;

			// Insert before [vars] section
			if (content.includes("[vars]")) {
				content = content.replace("[vars]", `${routesSection}\n[vars]`);
			} else {
				content += routesSection;
			}

			log("green", "✅ Added routes for custom domain");
			this.config.routesAdded = true;
		}

		fs.writeFileSync(wranglerPath, content, "utf-8");
		log("green", "✅ wrangler.toml updated");
	}

	displayFinalReport() {
		console.log("");
		logBold(
			"green",
			"╔══════════════════════════════════════════════════════════════╗",
		);
		logBold(
			"green",
			"║                    Setup Complete!                           ║",
		);
		logBold(
			"green",
			"╚══════════════════════════════════════════════════════════════╝",
		);
		console.log("");

		log("blue", "📦 Resources:");
		if (this.config.wfpAvailable) {
			log("green", "   ✅ Workers for Platforms: Available");
			log("green", "   ✅ Dispatch Namespace: Ready");
		} else {
			log(
				"yellow",
				"   ⚠️  Workers for Platforms: Not available (requires paid plan)",
			);
		}

		if (this.config.createdToken) {
			log("green", "   ✅ API Token: Created with correct permissions");
		}

		if (this.config.routesAdded) {
			log("green", "   ✅ Routes: Added to wrangler.toml");
		}

		console.log("");
		log("blue", "📋 Configuration:");
		log("cyan", `   Account ID: ${this.config.accountId}`);
		if (this.config.customDomain && this.config.customDomain !== "") {
			log("cyan", `   Custom Domain: ${this.config.customDomain}`);
			if (this.config.zoneId) {
				log("cyan", `   Zone ID: ${this.config.zoneId}`);
			}
			if (this.config.fallbackOrigin) {
				log("cyan", `   Fallback Origin: ${this.config.fallbackOrigin}`);
			}
		} else {
			log("cyan", "   Domain: Using workers.dev subdomain");
		}

		console.log("");
		log("blue", "🎯 Next Steps:");
		log("cyan", "   1. Run `npm run deploy` to deploy to Cloudflare");
		log("cyan", "   2. Run `npm run dev` to start local development");

		if (this.config.customDomain && this.config.customDomain !== "") {
			console.log("");
			log("yellow", "📝 DNS Setup Required:");
			log(
				"yellow",
				`   Add these DNS records for ${this.config.customDomain}:`,
			);
			console.log("");
			log(
				"cyan",
				"   ┌───────┬──────────┬─────────────┬────────────────────────────┐",
			);
			log(
				"cyan",
				"   │ Type  │ Name     │ Content     │ Result                     │",
			);
			log(
				"cyan",
				"   ├───────┼──────────┼─────────────┼────────────────────────────┤",
			);
			log(
				"cyan",
				`   │ A     │ @        │ 192.0.2.1   │ ${this.config.customDomain.padEnd(26)} │`,
			);
			log(
				"cyan",
				`   │ A     │ *        │ 192.0.2.1   │ *.${this.config.customDomain.padEnd(23)} │`,
			);
			if (this.config.fallbackOrigin) {
				const fbName = this.config.fallbackOrigin.replace(
					`.${this.config.customDomain}`,
					"",
				);
				log(
					"cyan",
					`   │ A     │ ${fbName.padEnd(8)} │ 192.0.2.1   │ ${this.config.fallbackOrigin.padEnd(26)} │`,
				);
			}
			log(
				"cyan",
				"   └───────┴──────────┴─────────────┴────────────────────────���───┘",
			);
			console.log("");
			log(
				"yellow",
				"   Note: 192.0.2.1 is a dummy IP - Cloudflare proxy handles routing.",
			);
		}

		console.log("");
		log("green", "✨ Happy building! ✨");
		console.log("");
	}
}

// Main execution
async function main() {
	const setup = new SetupManager();
	await setup.setup();
}

main().catch((error) => {
	console.error("Setup failed:", error);
	process.exit(1);
});

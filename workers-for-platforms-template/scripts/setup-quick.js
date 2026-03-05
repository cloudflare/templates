#!/usr/bin/env node

/**
 * Workers for Platforms Template - Quick Setup
 *
 * Setup script for Deploy to Cloudflare button flow.
 * - Creates dispatch namespace
 * - Creates a permanent API token with correct permissions
 * - Auto-detects zone ID for custom domain
 * - Updates wrangler.toml with routes
 *
 * Uses the temporary CF_API_TOKEN from deploy flow to create permanent resources.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");

// Colors
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const blue = "\x1b[34m";
const cyan = "\x1b[36m";
const red = "\x1b[31m";
const reset = "\x1b[0m";

function log(color, msg) {
	console.log(`${color}${msg}${reset}`);
}

function getVarFromWranglerToml(varName) {
	const configPath = path.join(PROJECT_ROOT, "wrangler.toml");
	if (fs.existsSync(configPath)) {
		const content = fs.readFileSync(configPath, "utf-8");
		// Match VAR_NAME = "value" in [vars] section
		const regex = new RegExp(`${varName}\\s*=\\s*["']([^"']*)["']`);
		const match = content.match(regex);
		if (match && match[1] && match[1] !== "") {
			return match[1];
		}
	}
	return null;
}

function getConfig() {
	// Read from environment variables (set by Deploy to Cloudflare flow)
	// CF_API_TOKEN and CF_ACCOUNT_ID are auto-provided by the deploy system
	// CLOUDFLARE_API_TOKEN is user-provided (optional) with SSL permissions for custom hostnames
	// Also check wrangler.toml for vars set by deploy form

	const deployToken = process.env.CF_API_TOKEN;
	const userToken = process.env.CLOUDFLARE_API_TOKEN; // User's token with SSL permissions

	return {
		accountId:
			process.env.CF_ACCOUNT_ID ||
			process.env.CLOUDFLARE_ACCOUNT_ID ||
			process.env.ACCOUNT_ID,
		apiToken: deployToken, // Use deploy token for setup operations (namespace creation, etc)
		userApiToken: userToken, // User's token with SSL permissions for custom hostnames
		customDomain:
			process.env.CUSTOM_DOMAIN || getVarFromWranglerToml("CUSTOM_DOMAIN"),
		zoneId:
			process.env.CLOUDFLARE_ZONE_ID ||
			getVarFromWranglerToml("CLOUDFLARE_ZONE_ID"),
		fallbackOrigin:
			process.env.FALLBACK_ORIGIN || getVarFromWranglerToml("FALLBACK_ORIGIN"),
	};
}

function getAuthHeaders(apiToken) {
	return {
		Authorization: `Bearer ${apiToken}`,
		"Content-Type": "application/json",
	};
}

function getDispatchNamespaceFromConfig() {
	const configPath = path.join(PROJECT_ROOT, "wrangler.toml");

	if (fs.existsSync(configPath)) {
		const content = fs.readFileSync(configPath, "utf-8");
		const match = content.match(
			/\[\[dispatch_namespaces\]\][\s\S]*?namespace\s*=\s*['"](.*?)['"]/,
		);
		if (match) return match[1];

		const varMatch = content.match(
			/DISPATCH_NAMESPACE_NAME\s*=\s*['"](.*?)['"]/,
		);
		if (varMatch) return varMatch[1];
	}

	return "workers-platform-template";
}

function ensureDispatchNamespace(namespaceName) {
	log(blue, `📦 Ensuring dispatch namespace '${namespaceName}' exists...`);

	try {
		execSync(`npx wrangler dispatch-namespace create ${namespaceName}`, {
			stdio: "pipe",
		});
		log(green, `✅ Created dispatch namespace '${namespaceName}'`);
		return true;
	} catch (error) {
		const output = error.stdout?.toString() || error.stderr?.toString() || "";

		if (
			output.includes("already exists") ||
			output.includes("A namespace with this name")
		) {
			log(green, `✅ Dispatch namespace '${namespaceName}' already exists`);
			return true;
		}

		if (output.includes("You do not have access")) {
			log(yellow, "⚠️  Workers for Platforms not available on this account");
			return false;
		}

		log(
			yellow,
			`⚠️  Could not create dispatch namespace: ${output || error.message}`,
		);
		return false;
	}
}

async function createPermanentToken(config) {
	if (!config.apiToken || !config.accountId) {
		log(
			yellow,
			"⚠️  No API token or account ID - cannot create permanent token",
		);
		return null;
	}

	log(blue, "🔐 Creating permanent API token for runtime operations...");

	try {
		// First, get the permission group IDs we need
		// We need: Workers Scripts (Read/Write), Zone Read (for custom hostnames)
		const permGroupsResponse = await fetch(
			"https://api.cloudflare.com/client/v4/user/tokens/permission_groups",
			{ headers: getAuthHeaders(config.apiToken) },
		);
		const permGroupsData = await permGroupsResponse.json();

		if (!permGroupsData.success) {
			log(
				yellow,
				"⚠️  Could not fetch permission groups - deploy token has limited permissions",
			);
			log(
				yellow,
				"   Custom domains will not work until you add a token with SSL permissions",
			);
			log(
				yellow,
				"   See README for instructions on creating a full-access token",
			);
			return null;
		}

		// Find the permission groups we need
		const permGroups = permGroupsData.result || [];
		const findPermGroup = (name) => {
			const group = permGroups.find((g) => g.name === name);
			return group ? { id: group.id, name: group.name } : null;
		};

		const accountPermissions = [
			findPermGroup("Workers Scripts Read"),
			findPermGroup("Workers Scripts Write"),
			findPermGroup("Account Settings Read"),
		].filter(Boolean);

		const zonePermissions = [
			findPermGroup("Zone Read"),
			findPermGroup("SSL and Certificates Write"), // For custom hostnames
			findPermGroup("SSL and Certificates Read"),
		].filter(Boolean);

		log(
			cyan,
			`   Found ${accountPermissions.length} account permissions, ${zonePermissions.length} zone permissions`,
		);

		// Build policies
		const policies = [];

		// Account-level permissions
		if (accountPermissions.length > 0) {
			policies.push({
				effect: "allow",
				resources: { [`com.cloudflare.api.account.${config.accountId}`]: "*" },
				permission_groups: accountPermissions,
			});
		}

		// Zone-level permissions (for all zones in account)
		if (zonePermissions.length > 0) {
			policies.push({
				effect: "allow",
				resources: { [`com.cloudflare.api.account.${config.accountId}`]: "*" },
				permission_groups: zonePermissions,
			});
		}

		if (policies.length === 0) {
			log(yellow, "⚠️  No valid permissions found");
			return null;
		}

		const tokenResponse = await fetch(
			"https://api.cloudflare.com/client/v4/user/tokens",
			{
				method: "POST",
				headers: getAuthHeaders(config.apiToken),
				body: JSON.stringify({
					name: `Workers Platform Template - ${new Date().toISOString().split("T")[0]}`,
					policies,
					condition: {},
					expires_on: new Date(
						Date.now() + 365 * 24 * 60 * 60 * 1000,
					).toISOString(),
				}),
			},
		);

		const tokenData = await tokenResponse.json();

		if (tokenResponse.ok && tokenData.success && tokenData.result?.value) {
			log(green, "✅ Created permanent API token");
			log(cyan, `   Token ID: ${tokenData.result.id}`);
			return tokenData.result.value;
		} else {
			log(
				yellow,
				`⚠️  Could not create token: ${tokenData.errors?.[0]?.message || "Unknown error"}`,
			);
			// Log more details for debugging
			if (tokenData.errors) {
				tokenData.errors.forEach((e) => log(yellow, `   Error: ${e.message}`));
			}
			return null;
		}
	} catch (error) {
		log(yellow, `⚠️  Token creation failed: ${error.message}`);
		return null;
	}
}

async function detectZoneId(config) {
	if (!config.customDomain || config.customDomain === "") {
		return null;
	}

	if (config.zoneId) {
		log(green, `✅ Using provided Zone ID: ${config.zoneId}`);
		return config.zoneId;
	}

	// Try user's API token first (has zone read), then deploy token
	const tokenToUse = config.userApiToken || config.apiToken;

	if (!tokenToUse) {
		log(yellow, "⚠️  No API token - cannot auto-detect zone ID");
		return null;
	}

	log(blue, `🔍 Auto-detecting zone ID for ${config.customDomain}...`);

	try {
		const domainParts = config.customDomain.split(".");

		for (let i = 0; i < domainParts.length - 1; i++) {
			const zoneName = domainParts.slice(i).join(".");

			let url = `https://api.cloudflare.com/client/v4/zones?name=${zoneName}`;
			if (config.accountId) {
				url += `&account.id=${config.accountId}`;
			}

			const response = await fetch(url, {
				headers: getAuthHeaders(tokenToUse),
			});
			const data = await response.json();

			if (data.success && data.result && data.result.length > 0) {
				const zone = data.result[0];
				log(green, `✅ Found zone: ${zone.name} (ID: ${zone.id})`);
				return zone.id;
			}
		}

		log(yellow, `⚠️  Could not auto-detect zone ID for ${config.customDomain}`);
		return null;
	} catch (error) {
		log(yellow, `⚠️  Zone detection failed: ${error.message}`);
		return null;
	}
}

function updateWranglerConfig(config) {
	const wranglerPath = path.join(PROJECT_ROOT, "wrangler.toml");

	if (!fs.existsSync(wranglerPath)) {
		log(yellow, "⚠️  wrangler.toml not found");
		return false;
	}

	let content = fs.readFileSync(wranglerPath, "utf-8");
	let modified = false;

	// Add ACCOUNT_ID to vars if not present
	if (config.accountId) {
		if (content.includes('ACCOUNT_ID = "')) {
			content = content.replace(
				/ACCOUNT_ID = ".*"/,
				`ACCOUNT_ID = "${config.accountId}"`,
			);
		} else {
			// Add after DISPATCH_NAMESPACE_NAME
			content = content.replace(
				/DISPATCH_NAMESPACE_NAME = ".*"/,
				`DISPATCH_NAMESPACE_NAME = "${getDispatchNamespaceFromConfig()}"\nACCOUNT_ID = "${config.accountId}"`,
			);
		}
		modified = true;
		log(green, `✅ Set ACCOUNT_ID`);
	}

	// Update CUSTOM_DOMAIN if set
	if (config.customDomain && config.customDomain !== "") {
		content = content.replace(
			/CUSTOM_DOMAIN = ".*"/,
			`CUSTOM_DOMAIN = "${config.customDomain}"`,
		);
		content = content.replace(/workers_dev = true/, "workers_dev = false");
		modified = true;
		log(green, `✅ Set CUSTOM_DOMAIN = "${config.customDomain}"`);
	}

	// Update CLOUDFLARE_ZONE_ID if set
	if (config.zoneId) {
		if (content.includes('CLOUDFLARE_ZONE_ID = "')) {
			content = content.replace(
				/CLOUDFLARE_ZONE_ID = ".*"/,
				`CLOUDFLARE_ZONE_ID = "${config.zoneId}"`,
			);
		} else {
			// Add to vars section
			content = content.replace(
				/CUSTOM_DOMAIN = ".*"/,
				`CUSTOM_DOMAIN = "${config.customDomain}"\nCLOUDFLARE_ZONE_ID = "${config.zoneId}"`,
			);
		}
		modified = true;
		log(green, `✅ Set CLOUDFLARE_ZONE_ID`);
	}

	// Set fallback origin (default to my.{domain})
	const fallbackOrigin =
		config.fallbackOrigin ||
		(config.customDomain ? `my.${config.customDomain}` : "");
	if (fallbackOrigin) {
		if (content.includes('FALLBACK_ORIGIN = "')) {
			content = content.replace(
				/FALLBACK_ORIGIN = ".*"/,
				`FALLBACK_ORIGIN = "${fallbackOrigin}"`,
			);
		} else if (config.zoneId) {
			content = content.replace(
				`CLOUDFLARE_ZONE_ID = "${config.zoneId}"`,
				`CLOUDFLARE_ZONE_ID = "${config.zoneId}"\nFALLBACK_ORIGIN = "${fallbackOrigin}"`,
			);
		}
		modified = true;
		log(green, `✅ Set FALLBACK_ORIGIN = "${fallbackOrigin}"`);
	}

	// Add routes if custom domain and zone ID are configured
	if (config.customDomain && config.customDomain !== "" && config.zoneId) {
		// Remove any existing routes section
		content = content.replace(
			/\n# Routes for custom domain\nroutes = \[[\s\S]*?\]\n/g,
			"",
		);
		content = content.replace(/\nroutes = \[[\s\S]*?\]\n/g, "");

		const routesSection = `
# Routes for custom domain
routes = [
  { pattern = "${config.customDomain}/*", zone_id = "${config.zoneId}" },
  { pattern = "*.${config.customDomain}/*", zone_id = "${config.zoneId}" }
]
`;

		// Insert routes after workers_dev line (top-level config area)
		if (content.includes("workers_dev = false")) {
			content = content.replace(
				"workers_dev = false",
				`workers_dev = false\n${routesSection}`,
			);
		} else if (content.includes("workers_dev = true")) {
			content = content.replace(
				"workers_dev = true",
				`workers_dev = false\n${routesSection}`,
			);
		} else {
			// Fallback: add after compatibility_flags or at top
			content = content.replace(
				/(compatibility_flags = \[.*?\])/,
				`$1\n${routesSection}`,
			);
		}

		modified = true;
		log(green, `✅ Added routes for ${config.customDomain}`);
	}

	if (modified) {
		fs.writeFileSync(wranglerPath, content, "utf-8");
		log(green, "✅ wrangler.toml updated");
	}

	return modified;
}

async function setWranglerSecrets(config) {
	log(blue, "🔐 Setting secrets via wrangler...");

	// Set user-provided API token if available (for custom hostnames)
	if (config.userApiToken) {
		try {
			execSync(
				`echo "${config.userApiToken}" | npx wrangler secret put CLOUDFLARE_API_TOKEN`,
				{
					stdio: "pipe",
					cwd: PROJECT_ROOT,
				},
			);
			log(green, "✅ Set CLOUDFLARE_API_TOKEN secret (for custom domains)");
		} catch (error) {
			log(
				yellow,
				`⚠️  Could not set CLOUDFLARE_API_TOKEN secret: ${error.message}`,
			);
		}
	}

	// Set dispatch namespace token
	const dispatchToken = config.runtimeToken || config.apiToken;
	if (dispatchToken) {
		try {
			execSync(
				`echo "${dispatchToken}" | npx wrangler secret put DISPATCH_NAMESPACE_API_TOKEN`,
				{
					stdio: "pipe",
					cwd: PROJECT_ROOT,
				},
			);
			log(green, "✅ Set DISPATCH_NAMESPACE_API_TOKEN secret");
		} catch (error) {
			log(
				yellow,
				`⚠️  Could not set DISPATCH_NAMESPACE_API_TOKEN secret: ${error.message}`,
			);
			log(yellow, "   You may need to set it manually in the dashboard");
		}
	}
}

async function main() {
	console.log("");
	log(blue, "🚀 Workers for Platforms - Quick Setup");
	log(blue, "──────────────────────────────────────");
	console.log("");

	// Debug: show what env vars are available
	log(cyan, "📋 Environment variables available:");
	log(cyan, `   CF_API_TOKEN: ${process.env.CF_API_TOKEN ? "set" : "not set"}`);
	log(
		cyan,
		`   CF_ACCOUNT_ID: ${process.env.CF_ACCOUNT_ID ? "set" : "not set"}`,
	);
	log(
		cyan,
		`   CLOUDFLARE_API_TOKEN: ${process.env.CLOUDFLARE_API_TOKEN ? "set" : "not set"}`,
	);
	log(
		cyan,
		`   CUSTOM_DOMAIN (env): ${process.env.CUSTOM_DOMAIN || "not set"}`,
	);
	log(
		cyan,
		`   CUSTOM_DOMAIN (toml): ${getVarFromWranglerToml("CUSTOM_DOMAIN") || "not set"}`,
	);
	console.log("");

	const config = getConfig();

	// Log what we found from environment
	log(cyan, "📋 Configuration resolved:");
	if (config.accountId) {
		log(cyan, `   Account ID: ${config.accountId.substring(0, 8)}...`);
	} else {
		log(yellow, "   Account ID: (not found)");
	}
	if (config.apiToken) {
		log(cyan, `   Deploy Token: ${config.apiToken.substring(0, 8)}...`);
	} else {
		log(yellow, "   Deploy Token: (not found)");
	}
	if (config.userApiToken) {
		log(
			green,
			`   User API Token: ${config.userApiToken.substring(0, 8)}... (will use for custom domains)`,
		);
	} else if (config.customDomain) {
		log(
			yellow,
			"   User API Token: (not provided - custom domains may not work)",
		);
	}
	if (config.customDomain) {
		log(cyan, `   Custom Domain: ${config.customDomain}`);
	} else {
		log(cyan, "   Custom Domain: (not set - using workers.dev)");
	}
	console.log("");

	// Create dispatch namespace
	const namespaceName = getDispatchNamespaceFromConfig();
	ensureDispatchNamespace(namespaceName);

	// Use user-provided API token if available, otherwise try to create one
	if (config.userApiToken) {
		log(green, "✅ Using user-provided API token for custom domains");
	} else {
		// Try to create permanent API token (may fail if deploy token lacks permissions)
		config.runtimeToken = await createPermanentToken(config);
	}

	// Auto-detect zone ID if custom domain is set
	if (config.customDomain && config.customDomain !== "" && !config.zoneId) {
		config.zoneId = await detectZoneId(config);
	}

	// Update wrangler.toml with config
	updateWranglerConfig(config);

	// Write secrets to .dev.vars file - wrangler will use these during deploy
	// Priority: user-provided token > auto-created token > deploy token
	const dispatchToken = config.runtimeToken || config.apiToken;
	const tokenSource = config.userApiToken
		? "user-provided"
		: config.runtimeToken
			? "auto-created"
			: "deploy";

	if (dispatchToken || config.accountId || config.userApiToken) {
		log(blue, "\n📝 Writing secrets to .dev.vars...");

		let devVarsContent = `# Auto-generated by setup script\n`;

		// If user provided API token with SSL permissions, store it for custom hostname operations
		if (config.userApiToken) {
			devVarsContent += `CLOUDFLARE_API_TOKEN="${config.userApiToken}"\n`;
			log(
				green,
				`   ✅ CLOUDFLARE_API_TOKEN (user-provided, for custom domains)`,
			);
		}

		// Set the token for dispatch namespace operations
		if (dispatchToken) {
			devVarsContent += `DISPATCH_NAMESPACE_API_TOKEN="${dispatchToken}"\n`;
			log(green, `   ✅ DISPATCH_NAMESPACE_API_TOKEN (${tokenSource} token)`);
		}

		if (config.accountId) {
			devVarsContent += `ACCOUNT_ID="${config.accountId}"\n`;
			log(green, `   ✅ ACCOUNT_ID`);
		}

		if (config.customDomain) {
			devVarsContent += `CUSTOM_DOMAIN="${config.customDomain}"\n`;
		}

		if (config.zoneId) {
			devVarsContent += `CLOUDFLARE_ZONE_ID="${config.zoneId}"\n`;
		}

		const fallbackOrigin =
			config.fallbackOrigin ||
			(config.customDomain ? `my.${config.customDomain}` : "");
		if (fallbackOrigin) {
			devVarsContent += `FALLBACK_ORIGIN="${fallbackOrigin}"\n`;
		}

		const devVarsPath = path.join(PROJECT_ROOT, ".dev.vars");
		fs.writeFileSync(devVarsPath, devVarsContent, "utf-8");
		log(green, "   ✅ .dev.vars file created");
	}

	// Set secrets after deploy (when --set-secrets flag is passed)
	const setSecretsFlag = process.argv.includes("--set-secrets");

	if (setSecretsFlag) {
		log(blue, "\n🔐 Setting secrets from .dev.vars...");
		// Read tokens from .dev.vars (saved during build phase)
		const devVarsPath = path.join(PROJECT_ROOT, ".dev.vars");
		if (fs.existsSync(devVarsPath)) {
			const devVarsContent = fs.readFileSync(devVarsPath, "utf-8");
			const getVar = (name) => {
				const match = devVarsContent.match(new RegExp(`${name}="([^"]*)"`));
				return match ? match[1] : null;
			};
			config.userApiToken =
				config.userApiToken || getVar("CLOUDFLARE_API_TOKEN");
			config.runtimeToken =
				config.runtimeToken ||
				getVar("DISPATCH_NAMESPACE_API_TOKEN") ||
				config.apiToken;
		}
		await setWranglerSecrets(config);
	}

	console.log("");
	log(green, "✅ Quick setup complete");
	console.log("");
}

main().catch((error) => {
	console.error("Setup error:", error);
	// Don't exit with error - let deployment continue
});

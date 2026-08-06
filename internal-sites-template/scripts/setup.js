#!/usr/bin/env node

/**
 * Internal Sites Platform -- Setup Script
 *
 * Runs during the "build" phase of Deploy to Cloudflare.
 *
 * What it does:
 *   1. Creates the dispatch namespace via `wrangler dispatch-namespace create`
 *   2. Writes ACCOUNT_ID and DISPATCH_NAMESPACE_API_TOKEN to .dev.vars
 *   3. On --set-secrets flag: sets secrets via `wrangler secret put`
 *
 * What it does NOT do:
 *   - Auto-create API tokens. Users must create their own token with
 *     Account > Workers Scripts > Edit permission.
 *   - Modify wrangler.jsonc. The config stays clean for the deploy flow.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");

// ── Colors ───────────────────────────────────────────────────────────────────

const green = "\x1b[32m";
const yellow = "\x1b[33m";
const blue = "\x1b[34m";
const cyan = "\x1b[36m";
const reset = "\x1b[0m";

function log(color, msg) {
	console.log(`${color}${msg}${reset}`);
}

// ── Config readers ───────────────────────────────────────────────────────────

function getDispatchNamespaceFromConfig() {
	const configPath = path.join(PROJECT_ROOT, "wrangler.jsonc");

	if (!fs.existsSync(configPath)) {
		return "internal-sites";
	}

	const content = fs.readFileSync(configPath, "utf-8");
	const match = content.match(/"namespace"\s*:\s*"([^"]+)"/);
	if (match) return match[1];

	return "internal-sites";
}

function getAccountId() {
	return (
		process.env.CF_ACCOUNT_ID ||
		process.env.CLOUDFLARE_ACCOUNT_ID ||
		process.env.ACCOUNT_ID ||
		null
	);
}

function getDispatchToken() {
	return process.env.DISPATCH_NAMESPACE_API_TOKEN || null;
}

// ── Dispatch namespace ───────────────────────────────────────────────────────

function ensureDispatchNamespace(namespaceName) {
	log(blue, `Creating dispatch namespace '${namespaceName}'...`);

	try {
		execSync(`npx wrangler dispatch-namespace create ${namespaceName}`, {
			stdio: "pipe",
		});
		log(green, `  Dispatch namespace '${namespaceName}' created.`);
		return true;
	} catch (error) {
		// Capture both stdout and stderr -- wrangler puts the banner on
		// stdout and the actual error on stderr.
		const stdout = error.stdout?.toString() || "";
		const stderr = error.stderr?.toString() || "";
		const output = stdout + "\n" + stderr;

		if (
			output.includes("already exists") ||
			output.includes("A namespace with this name") ||
			output.includes("namespace with that name already exists")
		) {
			log(green, `  Dispatch namespace '${namespaceName}' already exists.`);
			return true;
		}

		if (output.includes("You do not have access")) {
			log(
				yellow,
				"  Workers for Platforms is not available on this account.",
			);
			log(
				yellow,
				"  Enable it at: https://dash.cloudflare.com/?to=/:account/workers-for-platforms",
			);
			return false;
		}

		// Log full output for debugging
		log(yellow, "  Could not create dispatch namespace.");
		if (stderr.trim()) {
			log(yellow, `  stderr: ${stderr.trim()}`);
		}
		if (stdout.trim()) {
			log(yellow, `  stdout: ${stdout.trim()}`);
		}
		if (!stderr.trim() && !stdout.trim()) {
			log(yellow, `  error: ${error.message}`);
		}
		log(yellow, "");
		log(yellow, "  You can create it manually:");
		log(yellow, `    npx wrangler dispatch-namespace create ${namespaceName}`);
		return false;
	}
}

// ── wrangler.jsonc updater ────────────────────────────────────────────────────

/**
 * Write ACCOUNT_ID into wrangler.jsonc vars during the build step.
 * This mirrors the official CF template pattern (updateWranglerConfig in
 * setup-quick.js) so that `wrangler deploy` picks up ACCOUNT_ID as a
 * regular env var -- no post-deploy `wrangler secret put` needed.
 */
function updateWranglerConfig(accountId) {
	if (!accountId) return false;

	const configPath = path.join(PROJECT_ROOT, "wrangler.jsonc");
	if (!fs.existsSync(configPath)) {
		log(yellow, "  wrangler.jsonc not found -- skipping config update.");
		return false;
	}

	let content = fs.readFileSync(configPath, "utf-8");

	// Replace the ACCOUNT_ID placeholder (or existing value) in vars
	const updated = content.replace(
		/"ACCOUNT_ID"\s*:\s*"[^"]*"/,
		`"ACCOUNT_ID": "${accountId}"`,
	);

	if (updated === content) {
		log(yellow, "  Could not find ACCOUNT_ID in wrangler.jsonc vars.");
		return false;
	}

	fs.writeFileSync(configPath, updated, "utf-8");
	log(green, "  Set ACCOUNT_ID in wrangler.jsonc.");
	return true;
}

// ── .dev.vars ────────────────────────────────────────────────────────────────

function writeDevVars(accountId, dispatchToken) {
	const devVarsPath = path.join(PROJECT_ROOT, ".dev.vars");

	// Read existing .dev.vars if present
	let existing = {};
	if (fs.existsSync(devVarsPath)) {
		const content = fs.readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
			if (match) existing[match[1]] = match[2];
		}
	}

	// Merge: env vars override existing, existing fills gaps
	const vars = {};
	if (dispatchToken) vars.DISPATCH_NAMESPACE_API_TOKEN = dispatchToken;
	else if (existing.DISPATCH_NAMESPACE_API_TOKEN)
		vars.DISPATCH_NAMESPACE_API_TOKEN =
			existing.DISPATCH_NAMESPACE_API_TOKEN;

	if (accountId) vars.ACCOUNT_ID = accountId;
	else if (existing.ACCOUNT_ID) vars.ACCOUNT_ID = existing.ACCOUNT_ID;

	if (Object.keys(vars).length === 0) {
		return;
	}

	const lines = ["# Auto-generated by setup script"];
	for (const [key, value] of Object.entries(vars)) {
		lines.push(`${key}="${value}"`);
	}

	fs.writeFileSync(devVarsPath, lines.join("\n") + "\n", "utf-8");
	log(green, "  .dev.vars written.");
}

// ── Secrets ──────────────────────────────────────────────────────────────────

function setWranglerSecrets() {
	log(blue, "Setting secrets via wrangler...");

	const devVarsPath = path.join(PROJECT_ROOT, ".dev.vars");
	if (!fs.existsSync(devVarsPath)) {
		log(yellow, "  No .dev.vars found -- skipping secrets.");
		return;
	}

	const content = fs.readFileSync(devVarsPath, "utf-8");
	const getVar = (name) => {
		const match = content.match(new RegExp(`${name}="([^"]*)"`));
		return match ? match[1] : null;
	};

	const dispatchToken = getVar("DISPATCH_NAMESPACE_API_TOKEN");
	if (dispatchToken) {
		try {
			execSync(
				`echo "${dispatchToken}" | npx wrangler secret put DISPATCH_NAMESPACE_API_TOKEN`,
				{ stdio: "pipe", cwd: PROJECT_ROOT },
			);
			log(green, "  Set DISPATCH_NAMESPACE_API_TOKEN secret.");
		} catch (error) {
			log(
				yellow,
				`  Could not set DISPATCH_NAMESPACE_API_TOKEN: ${error.message}`,
			);
		}
	}

	// ACCOUNT_ID is set as a var in wrangler.jsonc during build -- no secret needed.
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
	console.log("");
	log(blue, "Internal Sites Platform -- Setup");
	log(blue, "────────────────────────────────");
	console.log("");

	const accountId = getAccountId();
	const dispatchToken = getDispatchToken();
	const namespaceName = getDispatchNamespaceFromConfig();

	log(cyan, "  Configuration:");
	log(
		cyan,
		`    Account ID: ${accountId ? accountId.substring(0, 8) + "..." : "(not found)"}`,
	);
	log(cyan, `    Dispatch token: ${dispatchToken ? "set" : "(not set)"}`);
	log(cyan, `    Namespace: ${namespaceName}`);
	console.log("");

	// 1. Write ACCOUNT_ID into wrangler.jsonc (so wrangler deploy picks it up)
	if (accountId) {
		updateWranglerConfig(accountId);
	}
	console.log("");

	// 2. Create dispatch namespace
	ensureDispatchNamespace(namespaceName);
	console.log("");

	// 3. Check token
	if (dispatchToken) {
		log(green, "  DISPATCH_NAMESPACE_API_TOKEN is set.");
	} else {
		log(
			cyan,
			"  DISPATCH_NAMESPACE_API_TOKEN is not in the build environment.",
		);
		log(
			cyan,
			"  If you entered it on the Deploy to Cloudflare page, it will be",
		);
		log(
			cyan,
			"  set as a Worker secret automatically after deployment finishes.",
		);
		log(cyan, "");
		log(
			cyan,
			"  If deploying manually, set it with:",
		);
		log(
			cyan,
			"    npx wrangler secret put DISPATCH_NAMESPACE_API_TOKEN",
		);
		console.log("");
	}

	// 4. Write .dev.vars (used by wrangler for local dev)
	writeDevVars(accountId, dispatchToken);

	// 5. Set secrets if --set-secrets flag is passed (runs after wrangler deploy)
	if (process.argv.includes("--set-secrets")) {
		console.log("");
		setWranglerSecrets();
	}

	console.log("");
	log(green, "  Setup complete.");
	console.log("");
}

main();

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { provision } = require("./setup.js");

const PROJECT_ROOT = path.join(__dirname, "..");

test("the ordinary build is a local-only type check", () => {
	const packageJson = JSON.parse(
		fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8"),
	);

	assert.equal(packageJson.scripts.build, "tsc");
	assert.doesNotMatch(
		packageJson.scripts.build,
		/setup|provision|wrangler|dispatch|deploy/i,
	);

	execFileSync(
		process.platform === "win32" ? "npm.cmd" : "npm",
		["run", "build"],
		{
			cwd: PROJECT_ROOT,
			env: {
				...process.env,
				CLOUDFLARE_ACCOUNT_ID: "build-must-not-use-this-account",
				CLOUDFLARE_API_TOKEN: "build-must-not-use-this-token",
			},
			stdio: "pipe",
		},
	);
});

test("deploy provisions before invoking Wrangler deploy", () => {
	const packageJson = JSON.parse(
		fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8"),
	);

	assert.equal(
		packageJson.scripts.deploy,
		'npm run setup && wrangler deploy --env=""',
	);
});

test("explicit setup propagates provisioning failures", () => {
	let calls = 0;
	const provisioningFailure = Object.assign(new Error("Wrangler failed"), {
		stderr: "Authentication error",
	});

	assert.throws(
		() =>
			provision({
				env: { CLOUDFLARE_ACCOUNT_ID: "test-account-id" },
				executeWrangler(args, env) {
					calls += 1;
					assert.deepEqual(args, [
						"dispatch-namespace",
						"create",
						"internal-sites",
					]);
					assert.equal(env.CLOUDFLARE_ACCOUNT_ID, "test-account-id");
					throw provisioningFailure;
				},
			}),
		/Could not create dispatch namespace 'internal-sites'/,
	);
	assert.equal(calls, 1);
});

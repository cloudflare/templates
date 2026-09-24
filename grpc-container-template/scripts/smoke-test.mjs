import { spawn } from "node:child_process";
import process from "node:process";

const HTTP_URL = "http://127.0.0.1:8787/health";
const CLIENT_TIMEOUT_MS = 120_000;
const SERVER_TIMEOUT_MS = 60_000;

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHttp(url, timeoutMs) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
		} catch {
			// Wrangler is still starting.
		}
		await delay(500);
	}

	throw new Error(`Timed out waiting for ${url}`);
}

function runClient() {
	return new Promise((resolve, reject) => {
		const client = spawn(
			"npm",
			[
				"--prefix",
				"container",
				"run",
				"client",
				"--",
				"127.0.0.1:8788",
				"2",
				"25",
			],
			{
				cwd: process.cwd(),
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		let output = "";
		const timeout = setTimeout(() => {
			client.kill("SIGKILL");
			reject(new Error(`gRPC client timed out.\n${output}`));
		}, CLIENT_TIMEOUT_MS);

		client.stdout.on("data", (chunk) => {
			const text = chunk.toString();
			output += text;
			process.stdout.write(text);
		});
		client.stderr.on("data", (chunk) => {
			const text = chunk.toString();
			output += text;
			process.stderr.write(text);
		});

		client.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		client.on("exit", (code) => {
			clearTimeout(timeout);
			if (code !== 0) {
				reject(new Error(`gRPC client exited with code ${code}.\n${output}`));
				return;
			}
			resolve(output);
		});
	});
}

async function stopProcessTree(child) {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}

	if (process.platform === "win32") {
		const taskkill = spawn(
			"taskkill",
			["/pid", String(child.pid), "/T", "/F"],
			{ stdio: "ignore" },
		);
		await new Promise((resolve) => taskkill.once("exit", resolve));
		return;
	}

	try {
		process.kill(-child.pid, "SIGTERM");
	} catch {
		child.kill("SIGTERM");
	}
	await delay(2_000);
	if (child.exitCode === null && child.signalCode === null) {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch {
			child.kill("SIGKILL");
		}
	}
}

const wrangler = spawn("npm", ["run", "dev"], {
	cwd: process.cwd(),
	detached: process.platform !== "win32",
	stdio: ["ignore", "pipe", "pipe"],
});

wrangler.stdout.on("data", (chunk) => process.stdout.write(chunk));
wrangler.stderr.on("data", (chunk) => process.stderr.write(chunk));

try {
	await waitForHttp(HTTP_URL, SERVER_TIMEOUT_MS);
	const output = await runClient();

	const expectedMessages = [
		"hello from the container gRPC server",
		"container echo 1: streaming message 1/2",
		"container echo 2: streaming message 2/2",
		"goodbye from the container gRPC server",
	];

	for (const message of expectedMessages) {
		if (!output.includes(message)) {
			throw new Error(`Missing expected client output: ${message}`);
		}
	}

	console.log("Full gRPC tunnel smoke test passed.");
} finally {
	await stopProcessTree(wrangler);
}

import { spawn } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

function runGrpcSmokeTest(): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.platform === "win32" ? "pnpm.cmd" : "pnpm",
			["run", "test:e2e"],
			{
				cwd: join(process.cwd(), "grpc-container-template"),
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		let output = "";
		for (const stream of [child.stdout, child.stderr]) {
			stream.on("data", (chunk) => {
				output += chunk.toString();
			});
		}

		child.once("error", reject);
		child.once("close", (code) => {
			if (code === 0) {
				resolve(output);
				return;
			}
			reject(new Error(`gRPC smoke test exited with code ${code}.\n${output}`));
		});
	});
}

test("proxies a bidirectional gRPC stream through the Container", async () => {
	test.setTimeout(180_000);

	const output = await runGrpcSmokeTest();

	expect(output).toContain("Full gRPC tunnel smoke test passed.");
});

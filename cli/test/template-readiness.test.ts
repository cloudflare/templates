import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";
import { TemplateServerManager } from "../../playwright-tests/utils/template-server";

async function probe(status: number, expectedStatus?: number) {
	const server = createServer((_req, res) => {
		res.writeHead(status);
		res.end();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const manager = new TemplateServerManager() as unknown as {
			waitForServer(
				url: string,
				child: ChildProcess,
				logs: string[],
				timeout: number,
				expected?: number,
			): Promise<void>;
		};
		await manager.waitForServer(
			`http://127.0.0.1:${(server.address() as AddressInfo).port}`,
			{ exitCode: null } as ChildProcess,
			[],
			30,
			expectedStatus,
		);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

describe("template readiness HTTP status", () => {
	it("preserves the default successful response behavior", async () => {
		await expect(probe(200)).resolves.toBeUndefined();
	});
	it("accepts protected readiness only when explicitly configured", async () => {
		await expect(probe(401, 401)).resolves.toBeUndefined();
	});
	it("does not accept an auth failure by default", async () => {
		await expect(probe(401)).rejects.toThrow("did not become ready");
	});
	it("never mistakes a server failure for protected readiness", async () => {
		await expect(probe(503, 401)).rejects.toThrow("did not become ready");
	});
});

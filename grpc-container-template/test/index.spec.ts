import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker, { GrpcContainer, STATUS } from "../src/index";

describe("gRPC Container Worker", () => {
	it("exposes HTTP and raw TCP handlers", () => {
		expect(typeof worker.fetch).toBe("function");
		expect(typeof worker.connect).toBe("function");
	});

	it("exposes a Durable Object raw TCP handler", () => {
		expect(typeof GrpcContainer.prototype.connect).toBe("function");
	});

	it("renders the architecture overview", async () => {
		const response = await exports.default.fetch("https://example.com/");
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(html).toContain("Stream gRPC through a Worker.");
		expect(html).toContain("ByteStream.Chat");
	});

	it("returns machine-readable connection metadata", async () => {
		const response = await exports.default.fetch(
			"https://example.com/api/status",
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(STATUS);
	});

	it("provides a health endpoint", async () => {
		const response = await exports.default.fetch("https://example.com/health");

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok\n");
	});

	it("returns JSON for unknown routes", async () => {
		const response = await exports.default.fetch("https://example.com/missing");

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Not found" });
	});
});

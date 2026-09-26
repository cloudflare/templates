import { describe, expect, it } from "vitest";
import worker, { GrpcContainer } from "../src/index";

describe("gRPC Container Worker", () => {
	it("exposes HTTP status and raw TCP handlers", () => {
		expect(Object.keys(worker)).toEqual(["fetch", "connect"]);
	});

	it("exposes a Worker connect handler", () => {
		expect(typeof worker.connect).toBe("function");
	});

	it("returns a plain-text status response without a UI", async () => {
		const response = await worker.fetch();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/plain");
		expect(await response.text()).toBe(
			"gRPC Container accepts connections over inbound TCP.\n",
		);
	});

	it("exposes a Durable Object connect handler", () => {
		expect(typeof GrpcContainer.prototype.connect).toBe("function");
	});

	it("does not expose a Durable Object fetch handler", () => {
		const durableObject = GrpcContainer.prototype as DurableObject;

		expect(durableObject.fetch).toBeUndefined();
	});

	it("uses the expected connect handler signatures", () => {
		expect(worker.connect).toHaveLength(2);
		expect(GrpcContainer.prototype.connect).toHaveLength(1);
	});
});

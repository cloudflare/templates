import { describe, expect, it } from "vitest";
import worker, { GrpcContainer } from "../src/index";

describe("gRPC Container Worker", () => {
	it("exposes only the raw TCP handler", () => {
		expect(Object.keys(worker)).toEqual(["connect"]);
	});

	it("exposes a Worker connect handler", () => {
		expect(typeof worker.connect).toBe("function");
	});

	it("does not expose a Worker fetch handler", () => {
		const handler = worker as ExportedHandler<Env>;

		expect(handler.fetch).toBeUndefined();
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

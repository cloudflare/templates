import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { MyContainer } from "../src/index";

function createEnv() {
	const fetch = vi.fn(async () => new Response("container response"));
	const getByName = vi.fn(() => ({ fetch }));
	const env = { MY_CONTAINER: { getByName } } as unknown as Env;
	return { env, fetch, getByName };
}

function createContainer(running = false) {
	const health = vi.fn(async () => new Response(null, { status: 200 }));
	const forward = vi.fn(async (_request: Request) => new Response("upstream"));
	let resolveExit: () => void;
	let rejectExit: (error: Error) => void;
	const container = {
		running,
		images: { base: "registry.cloudflare.com/example/image@sha256:abc" },
		start: vi.fn(() => {
			container.running = true;
		}),
		setInactivityTimeout: vi.fn(async () => {
			expect(container.running).toBe(true);
		}),
		monitor: vi.fn(
			() =>
				new Promise<void>((resolve, reject) => {
					resolveExit = resolve;
					rejectExit = reject;
				}),
		),
		getTcpPort: vi.fn(() => ({
			fetch: (request: Request | string) =>
				typeof request === "string" ? health() : forward(request),
		})),
	};
	const waitUntil = vi.fn();
	// Replace only the runtime container boundary, preserving the class methods.
	const object: MyContainer = Object.create(MyContainer.prototype);
	Object.defineProperty(object, "ctx", {
		value: { container, waitUntil, id: { toString: () => "test-instance" } },
	});
	return {
		object,
		container,
		health,
		forward,
		waitUntil,
		exit: () => {
			container.running = false;
			resolveExit();
		},
		fail: () => {
			container.running = false;
			rejectExit(new Error("exit code 1"));
		},
	};
}

afterEach(() => vi.restoreAllMocks());

describe("Worker routes", () => {
	it("lists routes without starting a container", async () => {
		const { env, getByName } = createEnv();
		const response = await worker.request(
			"http://example.com/",
			undefined,
			env,
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("GET /container/<ID>");
		expect(getByName).not.toHaveBeenCalled();
	});

	it("routes the same name consistently and different names separately", async () => {
		const { env, getByName } = createEnv();
		for (const name of ["one", "one", "two"]) {
			await worker.request(
				`http://example.com/container/${name}`,
				undefined,
				env,
			);
		}
		expect(getByName.mock.calls).toEqual([
			["/container/one"],
			["/container/one"],
			["/container/two"],
		]);
	});

	it("uses a stable singleton name", async () => {
		const { env, getByName } = createEnv();
		await worker.request("http://example.com/singleton", undefined, env);
		expect(getByName).toHaveBeenCalledWith("singleton");
	});

	it("selects only from the three pool names", async () => {
		const { env, getByName } = createEnv();
		for (const value of [0, 0.5, 0.999]) {
			vi.spyOn(Math, "random").mockReturnValue(value);
			await worker.request("http://example.com/lb", undefined, env);
		}
		expect(getByName.mock.calls).toEqual([["pool-0"], ["pool-1"], ["pool-2"]]);
	});

	it("isolates the error demo and returns a useful 502", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { env, fetch, getByName } = createEnv();
		fetch.mockRejectedValue(new Error("container exited"));
		const response = await worker.request(
			"http://example.com/error",
			undefined,
			env,
		);
		expect(getByName).toHaveBeenCalledWith("error-test");
		expect(response.status).toBe(502);
		expect(await response.text()).toContain("Check the Worker logs");
	});

	it("returns 404 without a container for an unknown route", async () => {
		const { env, getByName } = createEnv();
		const response = await worker.request(
			"http://example.com/missing",
			undefined,
			env,
		);
		expect(response.status).toBe(404);
		expect(getByName).not.toHaveBeenCalled();
	});
});

describe("Container lifecycle and proxy", () => {
	it("starts the named image with runtime size and environment", async () => {
		const { object, container } = createContainer();
		await object.fetch(new Request("https://example.com/singleton"));
		expect(container.start).toHaveBeenCalledWith({
			image: container.images.base,
			instance: "lite",
			enableInternet: false,
			env: {
				MESSAGE: "I was passed in when the Durable Object started me!",
				INSTANCE_ID: "test-instance",
			},
		});
		expect(container.setInactivityTimeout).toHaveBeenCalledWith(120_000);
	});

	it("shares startup and does not forward until the health check succeeds", async () => {
		const { object, container, health, forward } = createContainer();
		let ready: (response: Response) => void;
		health.mockImplementation(
			() =>
				new Promise((resolve) => {
					ready = resolve;
				}),
		);
		const first = object.fetch(new Request("https://example.com/one"));
		const second = object.fetch(new Request("https://example.com/two"));
		await vi.waitFor(() => expect(health).toHaveBeenCalledOnce());
		expect(container.start).toHaveBeenCalledOnce();
		expect(forward).not.toHaveBeenCalled();
		ready!(new Response(null, { status: 200 }));
		await Promise.all([first, second]);
		expect(forward).toHaveBeenCalledTimes(2);
	});

	it("retries connection failures and unhealthy responses", async () => {
		vi.spyOn(scheduler, "wait").mockResolvedValue(undefined);
		const { object, health, forward } = createContainer();
		health
			.mockRejectedValueOnce(new Error("not listening"))
			.mockResolvedValueOnce(new Response(null, { status: 503 }));
		await object.fetch(new Request("https://example.com/one"));
		expect(health).toHaveBeenCalledTimes(3);
		expect(forward).toHaveBeenCalledOnce();
	});

	it("bounds readiness retries and lets a later request recover", async () => {
		vi.spyOn(scheduler, "wait").mockResolvedValue(undefined);
		const { object, container, health, forward } = createContainer();
		health.mockResolvedValue(new Response(null, { status: 503 }));
		await expect(
			object.fetch(new Request("https://example.com/one")),
		).rejects.toThrow("did not become ready");
		expect(health).toHaveBeenCalledTimes(100);
		expect(forward).not.toHaveBeenCalled();
		health.mockResolvedValue(new Response(null, { status: 200 }));
		await object.fetch(new Request("https://example.com/one"));
		expect(container.start).toHaveBeenCalledOnce();
		expect(forward).toHaveBeenCalledOnce();
	});

	it("preserves method, path, query, body and response", async () => {
		const { object, forward } = createContainer(true);
		const upstream = new Response("result", {
			status: 201,
			headers: { "X-Test": "yes" },
		});
		forward.mockResolvedValue(upstream);
		const response = await object.fetch(
			new Request("https://example.com/data?q=1", {
				method: "POST",
				body: "payload",
				headers: { Host: "example.com" },
			}),
		);
		const request = forward.mock.calls[0][0];
		expect(request.url).toBe("http://container/data?q=1");
		expect(request.method).toBe("POST");
		expect(request.headers.has("host")).toBe(false);
		expect(await request.text()).toBe("payload");
		expect(response).toBe(upstream);
	});

	it("does not replay a failed application request", async () => {
		const { object, forward } = createContainer();
		forward.mockRejectedValue(new Error("connection closed"));
		await expect(
			object.fetch(new Request("https://example.com/error")),
		).rejects.toThrow("connection closed");
		expect(forward).toHaveBeenCalledOnce();
	});

	it("observes failure and restarts on the next request", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		const { object, container, waitUntil, fail } = createContainer();
		await object.fetch(new Request("https://example.com/one"));
		fail();
		await waitUntil.mock.calls[0][0];
		expect(logged).toHaveBeenCalledWith("Container failed:", expect.any(Error));
		await object.fetch(new Request("https://example.com/one"));
		expect(container.start).toHaveBeenCalledTimes(2);
		expect(container.monitor).toHaveBeenCalledTimes(2);
	});

	it("observes successful exit", async () => {
		const logged = vi.spyOn(console, "log").mockImplementation(() => {});
		const { object, waitUntil, exit } = createContainer();
		await object.fetch(new Request("https://example.com/one"));
		exit();
		await waitUntil.mock.calls[0][0];
		expect(logged).toHaveBeenCalledWith("Container exited successfully");
	});
});

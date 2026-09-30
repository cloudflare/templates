import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { GrpcContainer } from "../src/index";

function createSocket(chunks: Uint8Array[] = [], keepOpen = false) {
	const written: Uint8Array[] = [];
	const cancel = vi.fn();
	const abort = vi.fn();
	const end = vi.fn();
	let controller: ReadableStreamDefaultController<Uint8Array>;
	const socket: Socket = {
		readable: new ReadableStream<Uint8Array>({
			start(streamController) {
				controller = streamController;
				for (const chunk of chunks) {
					streamController.enqueue(chunk);
				}
				if (!keepOpen) {
					streamController.close();
				}
			},
			cancel,
		}),
		writable: new WritableStream<Uint8Array>({
			write(chunk) {
				written.push(chunk);
			},
			close: end,
			abort,
		}),
		opened: Promise.resolve({}),
		closed: new Promise(() => {}),
		close: vi.fn().mockResolvedValue(undefined),
		startTls: vi.fn(),
		upgraded: false,
		secureTransport: "off",
		protocol: "tcp",
	};
	return { socket, written, cancel, abort, end, controller: controller! };
}

function createEnv(socket: Socket) {
	const connect = vi.fn().mockReturnValue(socket);
	const getByName = vi.fn().mockReturnValue({ connect });
	const env = { GRPC_CONTAINER: { getByName } } as Env;
	return { env, connect, getByName };
}

function createContainer(socket: Socket, running = true) {
	const container = {
		running,
		start: vi.fn(() => {
			container.running = true;
		}),
		getTcpPort: vi.fn().mockReturnValue({
			connect: vi.fn().mockReturnValue(socket),
		}),
	};
	const durableObject: GrpcContainer = Object.create(GrpcContainer.prototype);
	Object.defineProperty(durableObject, "ctx", { value: { container } });
	return { durableObject, container };
}

afterEach(() => {
	vi.restoreAllMocks();
});

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

	it("disables caching for the HTTP status response", async () => {
		const response = await worker.fetch();
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("forwards binary data in both directions and closes both sockets", async () => {
		const request = new Uint8Array([0, 255, 128, 10]);
		const response = new Uint8Array([254, 0, 1]);
		const incoming = createSocket([request]);
		const upstream = createSocket([response]);
		const { env, connect, getByName } = createEnv(upstream.socket);

		await worker.connect(incoming.socket, env);

		expect(getByName).toHaveBeenCalledWith("grpc-demo");
		expect(connect).toHaveBeenCalledWith("grpc-container:50051", {
			allowHalfOpen: true,
			secureTransport: "off",
		});
		expect(upstream.written).toEqual([request]);
		expect(incoming.written).toEqual([response]);
		expect(incoming.socket.close).toHaveBeenCalledOnce();
		expect(upstream.socket.close).toHaveBeenCalledOnce();
	});

	it("keeps the response direction open after the client half-closes", async () => {
		const incoming = createSocket();
		const upstream = createSocket([], true);
		const { env } = createEnv(upstream.socket);
		const connection = worker.connect(incoming.socket, env);

		await vi.waitFor(() => expect(upstream.end).toHaveBeenCalledOnce());
		expect(incoming.socket.close).not.toHaveBeenCalled();
		const goodbye = new TextEncoder().encode("goodbye");
		upstream.controller.enqueue(goodbye);
		upstream.controller.close();
		await connection;

		expect(incoming.written).toEqual([goodbye]);
		expect(incoming.socket.close).toHaveBeenCalledOnce();
	});

	it("closes both sockets without waiting for the other pipe after a failure", async () => {
		const incoming = createSocket([], true);
		const upstream = createSocket([], true);
		const { env } = createEnv(upstream.socket);
		vi.spyOn(incoming.socket.readable, "pipeTo").mockRejectedValue(
			new Error("client disconnected"),
		);
		const connection = worker.connect(incoming.socket, env);

		await connection;

		expect(incoming.socket.close).toHaveBeenCalledOnce();
		expect(upstream.socket.close).toHaveBeenCalledOnce();
	});

	it("closes both sockets if the Durable Object connection fails to open", async () => {
		const incoming = createSocket();
		const upstream = createSocket();
		const { env, connect } = createEnv(upstream.socket);
		connect.mockImplementation(() => ({
			...upstream.socket,
			opened: Promise.reject(new Error("upstream unavailable")),
		}));

		await expect(worker.connect(incoming.socket, env)).rejects.toThrow(
			"upstream unavailable",
		);
		expect(incoming.socket.close).toHaveBeenCalledOnce();
		expect(upstream.socket.close).toHaveBeenCalledOnce();
	});

	it("closes the client if creating the Durable Object socket throws", async () => {
		const incoming = createSocket();
		const { env, connect } = createEnv(createSocket().socket);
		connect.mockImplementation(() => {
			throw new Error("connect failed");
		});

		await expect(worker.connect(incoming.socket, env)).rejects.toThrow(
			"connect failed",
		);
		expect(incoming.socket.close).toHaveBeenCalledOnce();
	});
});

describe("gRPC Container lifecycle", () => {
	it("shares the startup wait across concurrent connections", async () => {
		let finishStartup: () => void;
		const startup = new Promise<void>((resolve) => {
			finishStartup = resolve;
		});
		vi.spyOn(scheduler, "wait").mockImplementation((milliseconds) =>
			milliseconds === 3_000 ? startup : Promise.resolve(),
		);
		const upstream = createSocket();
		const nextUpstream = createSocket();
		const { durableObject, container } = createContainer(
			upstream.socket,
			false,
		);
		container.getTcpPort.mockReturnValue({
			connect: vi
				.fn()
				.mockReturnValueOnce(upstream.socket)
				.mockReturnValueOnce(nextUpstream.socket),
		});

		const first = durableObject.connect(createSocket().socket);
		const second = durableObject.connect(createSocket().socket);
		expect(container.start).toHaveBeenCalledOnce();
		expect(container.getTcpPort).not.toHaveBeenCalled();
		finishStartup!();
		await Promise.all([first, second]);

		expect(container.getTcpPort).toHaveBeenCalledTimes(2);
		expect(upstream.socket.close).toHaveBeenCalledOnce();
		expect(nextUpstream.socket.close).toHaveBeenCalledOnce();
	});

	it("forwards data to an already-running Container", async () => {
		vi.spyOn(scheduler, "wait").mockResolvedValue(undefined);
		const request = new Uint8Array([0, 255]);
		const response = new Uint8Array([128, 1]);
		const incoming = createSocket([request]);
		const upstream = createSocket([response]);
		const { durableObject, container } = createContainer(upstream.socket);

		await durableObject.connect(incoming.socket);

		expect(container.start).not.toHaveBeenCalled();
		expect(container.getTcpPort).toHaveBeenCalledWith(50051);
		expect(upstream.written).toEqual([request]);
		expect(incoming.written).toEqual([response]);
		expect(incoming.socket.close).toHaveBeenCalledOnce();
		expect(upstream.socket.close).toHaveBeenCalledOnce();
	});

	it("restarts a stopped Container on the same Durable Object", async () => {
		vi.spyOn(scheduler, "wait").mockResolvedValue(undefined);
		const upstream = createSocket();
		const { durableObject, container } = createContainer(
			upstream.socket,
			false,
		);

		await durableObject.connect(createSocket().socket);
		container.running = false;
		const nextUpstream = createSocket();
		container.getTcpPort.mockReturnValue({
			connect: vi.fn().mockReturnValue(nextUpstream.socket),
		});
		await durableObject.connect(createSocket().socket);

		expect(container.start).toHaveBeenCalledTimes(2);
		expect(container.start).toHaveBeenCalledWith({
			enableInternet: false,
			env: { GRPC_PORT: "50051" },
		});
	});

	it("retries and closes a port that closes before becoming ready", async () => {
		vi.spyOn(scheduler, "wait").mockResolvedValue(undefined);
		const incoming = createSocket();
		const early = createSocket();
		const upstream = createSocket();
		const { durableObject, container } = createContainer(upstream.socket);
		const connect = vi
			.fn()
			.mockReturnValueOnce({ ...early.socket, closed: Promise.resolve() })
			.mockReturnValue(upstream.socket);
		container.getTcpPort.mockReturnValue({ connect });

		await durableObject.connect(incoming.socket);

		expect(connect).toHaveBeenCalledTimes(2);
		expect(early.socket.close).toHaveBeenCalledOnce();
		expect(upstream.socket.close).toHaveBeenCalledOnce();
	});

	it("bounds startup retries and closes the client when the port is unavailable", async () => {
		vi.spyOn(scheduler, "wait").mockResolvedValue(undefined);
		const incoming = createSocket();
		const upstream = createSocket();
		const { durableObject, container } = createContainer(upstream.socket);
		const connect = vi.fn(() => ({
			...upstream.socket,
			opened: Promise.reject(new Error("connection refused")),
		}));
		container.getTcpPort.mockReturnValue({ connect });

		await expect(durableObject.connect(incoming.socket)).rejects.toThrow(
			"Container gRPC port did not become ready",
		);
		expect(connect).toHaveBeenCalledTimes(60);
		expect(upstream.socket.close).toHaveBeenCalledTimes(60);
		expect(incoming.socket.close).toHaveBeenCalledOnce();
	});

	it("closes the client when no Container is configured", async () => {
		const incoming = createSocket();
		const durableObject: GrpcContainer = Object.create(GrpcContainer.prototype);
		Object.defineProperty(durableObject, "ctx", { value: {} });

		await expect(durableObject.connect(incoming.socket)).rejects.toThrow(
			"Container binding is unavailable",
		);
		expect(incoming.socket.close).toHaveBeenCalledOnce();
	});
});

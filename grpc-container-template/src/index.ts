import { DurableObject } from "cloudflare:workers";
import { renderHomePage } from "./ui";

const CONTAINER_INSTANCE = "grpc-demo";
const GRPC_PORT = 50051;
const LOCAL_GRPC_PORT = 8788;
const CONTAINER_CONNECT_ATTEMPTS = 60;
const CONTAINER_CONNECT_RETRY_MS = 250;
const CONTAINER_STARTUP_GRACE_MS = 3_000;
const CONTAINER_STABILITY_WINDOW_MS = 250;

const SOCKET_OPTIONS: SocketOptions = {
	// A gRPC client half-closes its request stream before the server finishes
	// writing its response stream, so the two directions must remain independent.
	allowHalfOpen: true,
	// The connection is private between the Durable Object and its Container.
	secureTransport: "off",
};

export const STATUS = {
	name: "gRPC Container",
	protocol: "gRPC over raw TCP",
	localGrpcAddress: `127.0.0.1:${LOCAL_GRPC_PORT}`,
	containerPort: GRPC_PORT,
	path: [
		"Worker connect()",
		"Durable Object connect()",
		`Container TCP port ${GRPC_PORT}`,
		"ByteStream.Chat",
	],
} as const;

function log(event: string, details: Record<string, unknown> = {}): void {
	console.log(JSON.stringify({ event, ...details }));
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set("content-type", "application/json; charset=utf-8");
	headers.set("cache-control", "no-store");
	return Response.json(value, { ...init, headers });
}

async function bridgeSockets(left: Socket, right: Socket): Promise<void> {
	const results = await Promise.allSettled([
		left.readable.pipeTo(right.writable),
		right.readable.pipeTo(left.writable),
	]);

	for (const result of results) {
		if (result.status === "rejected") {
			log("socket_pipe_closed", {
				reason:
					result.reason instanceof Error
						? result.reason.message
						: String(result.reason),
			});
		}
	}
}

export class GrpcContainer extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.ctx.blockConcurrencyWhile(async () => {
			if (!this.ctx.container) {
				throw new Error("Container binding is unavailable");
			}

			if (!this.ctx.container.running) {
				this.ctx.container.start({
					enableInternet: false,
					env: {
						GRPC_PORT: String(GRPC_PORT),
					},
				});
				// `running` indicates that the Container VM has started, but the
				// process inside it still needs a moment to bind the gRPC port.
				await scheduler.wait(CONTAINER_STARTUP_GRACE_MS);
			}
		});
	}

	private async openGrpcSocket(): Promise<Socket> {
		if (!this.ctx.container) {
			throw new Error("Container binding is unavailable");
		}

		let lastError: unknown;

		for (let attempt = 1; attempt <= CONTAINER_CONNECT_ATTEMPTS; attempt += 1) {
			const candidate = this.ctx.container
				.getTcpPort(GRPC_PORT)
				.connect(`10.0.0.1:${GRPC_PORT}`, SOCKET_OPTIONS);

			try {
				await candidate.opened;

				// A connection can open and immediately close while the process inside
				// the Container is still binding its port. Give it a short stability
				// window before accepting it.
				const closedBeforeReady = await Promise.race([
					candidate.closed.then(
						() => true,
						() => true,
					),
					scheduler.wait(CONTAINER_STABILITY_WINDOW_MS).then(() => false),
				]);

				if (!closedBeforeReady) {
					return candidate;
				}

				candidate.close();
				lastError = new Error("Container port closed before becoming ready");
			} catch (error) {
				candidate.close();
				lastError = error;
			}

			if (attempt < CONTAINER_CONNECT_ATTEMPTS) {
				await scheduler.wait(CONTAINER_CONNECT_RETRY_MS);
			}
		}

		throw new Error("Container gRPC port did not become ready", {
			cause: lastError,
		});
	}

	async connect(socket: Socket): Promise<void> {
		log("durable_object_connection_opened", { containerPort: GRPC_PORT });
		const upstream = await this.openGrpcSocket();

		try {
			await bridgeSockets(socket, upstream);
		} finally {
			socket.close();
			upstream.close();
			log("durable_object_connection_closed");
		}
	}
}

const worker = {
	async fetch(request): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/") {
			return new Response(renderHomePage(STATUS), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "public, max-age=300",
					"content-security-policy":
						"default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'",
					"x-content-type-options": "nosniff",
				},
			});
		}

		if (request.method === "GET" && url.pathname === "/api/status") {
			return jsonResponse(STATUS);
		}

		if (request.method === "GET" && url.pathname === "/health") {
			return new Response("ok\n", {
				headers: {
					"content-type": "text/plain; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}

		return jsonResponse({ error: "Not found" }, { status: 404 });
	},

	async connect(socket, env): Promise<void> {
		log("worker_connection_opened", { localPort: LOCAL_GRPC_PORT });
		const container = env.GRPC_CONTAINER.getByName(CONTAINER_INSTANCE);
		const durableObjectSocket = container.connect(
			`grpc-container:${GRPC_PORT}`,
			SOCKET_OPTIONS,
		);

		try {
			await durableObjectSocket.opened;
			await bridgeSockets(socket, durableObjectSocket);
		} finally {
			socket.close();
			durableObjectSocket.close();
			log("worker_connection_closed");
		}
	},
} satisfies ExportedHandler<Env>;

export default worker;

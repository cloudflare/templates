import { DurableObject } from "cloudflare:workers";

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

function log(event: string, details: Record<string, unknown> = {}): void {
	console.log(JSON.stringify({ event, ...details }));
}

async function bridgeSockets(left: Socket, right: Socket): Promise<void> {
	try {
		await Promise.all([
			left.readable.pipeTo(right.writable),
			right.readable.pipeTo(left.writable),
		]);
	} catch (error) {
		log("socket_pipe_closed", {
			reason: error instanceof Error ? error.message : String(error),
		});
	}
}

export class GrpcContainer extends DurableObject<Env> {
	private starting: Promise<void> | undefined;

	private async openGrpcSocket(): Promise<Socket> {
		const container = this.ctx.container;
		if (!container) {
			throw new Error("Container binding is unavailable");
		}

		if (!container.running && !this.starting) {
			container.start({
				enableInternet: false,
				env: { GRPC_PORT: String(GRPC_PORT) },
			});
			this.starting = scheduler.wait(CONTAINER_STARTUP_GRACE_MS).finally(() => {
				this.starting = undefined;
			});
		}
		await this.starting;

		let lastError: unknown;

		for (let attempt = 1; attempt <= CONTAINER_CONNECT_ATTEMPTS; attempt += 1) {
			let candidate: Socket | undefined;

			try {
				candidate = container
					.getTcpPort(GRPC_PORT)
					.connect(`10.0.0.1:${GRPC_PORT}`, SOCKET_OPTIONS);
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

				lastError = new Error("Container port closed before becoming ready");
			} catch (error) {
				lastError = error;
			}

			await candidate?.close().catch(() => {});

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
		let upstream: Socket | undefined;

		try {
			upstream = await this.openGrpcSocket();
			await bridgeSockets(socket, upstream);
		} finally {
			await Promise.allSettled([socket.close(), upstream?.close()]);
			log("durable_object_connection_closed");
		}
	}
}

const worker = {
	async fetch(): Promise<Response> {
		return new Response(
			"gRPC Container accepts connections over inbound TCP.\n",
			{
				headers: {
					"content-type": "text/plain; charset=utf-8",
					"cache-control": "no-store",
				},
			},
		);
	},

	async connect(socket, env): Promise<void> {
		log("worker_connection_opened", { localPort: LOCAL_GRPC_PORT });
		let durableObjectSocket: Socket | undefined;

		try {
			const container = env.GRPC_CONTAINER.getByName(CONTAINER_INSTANCE);
			durableObjectSocket = container.connect(
				`grpc-container:${GRPC_PORT}`,
				SOCKET_OPTIONS,
			);
			await durableObjectSocket.opened;
			await bridgeSockets(socket, durableObjectSocket);
		} finally {
			await Promise.allSettled([socket.close(), durableObjectSocket?.close()]);
			log("worker_connection_closed");
		}
	},
} satisfies ExportedHandler<Env>;

export default worker;

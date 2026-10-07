import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";

const PORT = 8080;
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;
const POOL_SIZE = 3;

export class MyContainer extends DurableObject<Env> {
	private starting: Promise<void> | undefined;
	private monitoring: Promise<void> | undefined;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		const container = ctx.container;
		if (container?.running) {
			// Restore the timeout and exit monitoring after a DO restart.
			void ctx.blockConcurrencyWhile(() =>
				container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS),
			);
			this.observeExit();
		}
	}

	async fetch(request: Request): Promise<Response> {
		// Share startup across concurrent requests, including after a failed attempt.
		this.starting ??= this.startAndWaitForPort().finally(() => {
			this.starting = undefined;
		});
		await this.starting;

		const url = new URL(request.url);
		url.protocol = "http:";
		url.host = "container";
		const forwarded = new Request(url, request);
		forwarded.headers.delete("host");
		return this.ctx.container!.getTcpPort(PORT).fetch(forwarded);
	}

	private async startAndWaitForPort(): Promise<void> {
		const container = this.ctx.container!;
		if (!container.running) {
			container.start({
				image: container.images.base,
				instance: "lite",
				enableInternet: false,
				env: {
					MESSAGE: "I was passed in when the Durable Object started me!",
					INSTANCE_ID: this.ctx.id.toString(),
				},
			});
		}
		this.observeExit();
		await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);

		// running means startup was requested, not that the HTTP server is ready.
		const port = container.getTcpPort(PORT);
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				const response = await port.fetch("http://container/health", {
					signal: AbortSignal.timeout(1000),
				});
				await response.body?.cancel();
				if (response.ok) return;
			} catch {
				// The port may not be listening yet. Retry the readiness probe only.
			}
			await scheduler.wait(200);
		}
		throw new Error("Container did not become ready on port 8080");
	}

	private observeExit(): void {
		if (this.monitoring) return;
		this.monitoring = this.ctx
			.container!.monitor()
			.then(() => console.log("Container exited successfully"))
			.catch((error: unknown) => console.error("Container failed:", error))
			.finally(() => {
				this.monitoring = undefined;
			});
		this.ctx.waitUntil(this.monitoring);
	}
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
	c.text(
		"Available endpoints:\n" +
			"GET /container/<ID> - Route to a named container\n" +
			"GET /lb - Route to one of three container instances\n" +
			"GET /error - Exit a dedicated test container with an error\n" +
			"GET /singleton - Route to the same container instance",
	),
);

app.get("/container/:id", (c) =>
	c.env.MY_CONTAINER.getByName(`/container/${c.req.param("id")}`).fetch(
		c.req.raw,
	),
);

app.get("/error", (c) =>
	c.env.MY_CONTAINER.getByName("error-test").fetch(c.req.raw),
);

app.get("/lb", (c) => {
	const index = Math.floor(Math.random() * POOL_SIZE);
	return c.env.MY_CONTAINER.getByName(`pool-${index}`).fetch(c.req.raw);
});

app.get("/singleton", (c) =>
	c.env.MY_CONTAINER.getByName("singleton").fetch(c.req.raw),
);

app.onError((error, c) => {
	console.error("Container request failed:", error);
	return c.text(
		"Container request failed. Check the Worker logs and retry.",
		502,
	);
});

export default app;

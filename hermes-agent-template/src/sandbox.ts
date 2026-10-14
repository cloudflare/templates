import { DurableObject } from "cloudflare:workers";
import { modelBaseUrl } from "./helpers";

const ca = "/etc/cloudflare/certs/cloudflare-containers-ca.crt";

export class HermesSandbox extends DurableObject<Env> {
	private ready?: Promise<void>;
	private cookie = "";
	private authenticatedAt = 0;

	async fetch(request: Request): Promise<Response> {
		try {
			if (
				this.authenticatedAt &&
				(!this.ctx.container!.running ||
					Date.now() - this.authenticatedAt > 10 * 60 * 60_000)
			) {
				this.ready = undefined;
				this.authenticatedAt = 0;
			}
			// Coalesce the dashboard's concurrent asset/API requests during a cold start.
			this.ready ??= this.initialize().catch((error) => {
				this.ready = undefined;
				throw error;
			});
			await this.ready;
			const headers = new Headers(request.headers);
			for (const name of [...headers.keys()]) {
				if (
					name.startsWith("cf-access-") ||
					["authorization", "cookie"].includes(name)
				)
					headers.delete(name);
			}
			headers.set("Cookie", this.cookie);
			const response = await this.ctx
				.container!.getTcpPort(9119)
				.fetch(new Request(request, { headers }));
			// Preserve WebSocket upgrades. Backend session cookies never leave the Worker.
			if (response.status === 101) return response;
			const result = new Response(response.body, response);
			result.headers.delete("Set-Cookie");
			result.headers.set("Cache-Control", "private, no-store");
			return result;
		} catch (error) {
			console.error(
				"Dashboard unavailable",
				error instanceof Error ? error.message : "Unknown error",
			);
			return new Response(
				"Dashboard is starting. Please reload in a few seconds.",
				{ status: 503, headers: { "Retry-After": "5" } },
			);
		}
	}

	private async initialize() {
		const container = this.ctx.container!;
		let password = await this.ctx.storage.get<string>("backend-password");
		if (!password) {
			password = crypto.randomUUID() + crypto.randomUUID();
			await this.ctx.storage.put("backend-password", password);
		}
		await container.interceptAllOutboundHttp(this.ctx.exports.Outbound);
		await container.interceptOutboundHttps("*", this.ctx.exports.Outbound);
		if (!container.running) {
			container.start({
				image: container.images.hermes,
				instance: "standard-1",
				enableInternet: false,
				env: {
					HOME: "/root",
					HERMES_HOME: "/workspace/.hermes",
					TERMINAL_ENV: "local",
					TERMINAL_CWD: "/workspace",
					MODEL: this.env.MODEL,
					OPENAI_API_KEY: "provided-by-worker",
					CUSTOM_BASE_URL: modelBaseUrl,
					OPENAI_BASE_URL: modelBaseUrl,
					HERMES_DASHBOARD_BASIC_AUTH_USERNAME: "sandbox",
					HERMES_DASHBOARD_BASIC_AUTH_PASSWORD: password,
					HERMES_DISABLE_LAZY_INSTALLS: "1",
					PYTHONUNBUFFERED: "1",
					GIT_TERMINAL_PROMPT: "0",
					SSL_CERT_FILE: ca,
					REQUESTS_CA_BUNDLE: ca,
					GIT_SSL_CAINFO: ca,
				},
			});
		}
		await container.setInactivityTimeout(15 * 60_000);
		const port = container.getTcpPort(9119);
		const deadline = Date.now() + 90_000;
		while (true) {
			try {
				const response = await port.fetch("http://localhost:9119/api/status", {
					signal: AbortSignal.timeout(3000),
				});
				await response.body?.cancel();
				if (response.ok) break;
			} catch {
				/* A started container is not necessarily listening yet. */
			}
			if (Date.now() >= deadline)
				throw new Error("Dashboard startup timed out");
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		// Access authenticates users; this second session only crosses the private container port.
		// Keeping Hermes's own auth enabled avoids patching upstream or using --insecure.
		const login = await port.fetch(
			"http://localhost:9119/auth/password-login",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "basic",
					username: "sandbox",
					password,
				}),
			},
		);
		await login.body?.cancel();
		if (!login.ok) throw new Error(`Backend login failed (${login.status})`);
		this.cookie = login.headers
			.getSetCookie()
			.map((cookie) => cookie.split(";")[0])
			.join("; ");
		if (!this.cookie) throw new Error("Backend did not issue a session");
		this.authenticatedAt = Date.now();
	}
}

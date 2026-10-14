import { WorkerEntrypoint } from "cloudflare:workers";
import { modelBaseUrl, readText } from "./helpers";

export class Outbound extends WorkerEntrypoint<Env> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.protocol !== "https:" || (url.port && url.port !== "443")) {
			return new Response("HTTPS only", { status: 403 });
		}

		if (
			url.href === `${modelBaseUrl}/chat/completions` &&
			request.method === "POST"
		) {
			let payload;
			try {
				payload = JSON.parse(await readText(request.body, 4 * 1024 * 1024));
			} catch {
				return new Response("Invalid model request (maximum 4 MiB)", {
					status: 400,
				});
			}
			if (
				payload?.model !== this.env.MODEL ||
				!Array.isArray(payload.messages)
			) {
				return new Response("Use the configured model and a messages array", {
					status: 400,
				});
			}
			const { model, ...inputs } = payload;
			// Hermes defaults to medium reasoning; GPT-4.1 mini rejects this option.
			if (model === "openai/gpt-4.1-mini") delete inputs.reasoning_effort;
			// The binding authenticates; sandbox headers cannot select another gateway.
			const response = await this.env.AI.run(model, inputs, {
				gateway: { id: this.env.AI_GATEWAY_ID, skipCache: true },
				returnRawResponse: true,
			});
			if (!(response instanceof Response))
				throw new Error("Expected a raw AI Gateway response");
			return response;
		}
		// Git smart HTTP uses GET and POST. No GitHub token is supplied.
		if (
			url.hostname === "github.com" &&
			["GET", "POST"].includes(request.method)
		) {
			const headers = new Headers(request.headers);
			headers.delete("Authorization");
			return fetch(new Request(request, { headers, redirect: "manual" }));
		}
		return new Response("Destination is not allowed", { status: 403 });
	}
}

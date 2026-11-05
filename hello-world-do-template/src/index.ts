import { DurableObject } from "cloudflare:workers";
import { fetchRetry } from "fetch-retry-jitter";
import { envAssert } from "env-assert-typed";

/**
 * Welcome to Cloudflare Workers! This is a Durable Objects starter with
 * zero-dependency resilient fetch and typed environment validation.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

interface Env {
	MY_DURABLE_OBJECT: DurableObjectNamespace;
	API_BASE_URL: string;
	API_TIMEOUT_MS: number;
	RETRY_ATTEMPTS: number;
}

/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async sayHello(): Promise<string> {
		let result = this.ctx.storage.sql
			.exec("SELECT 'Hello, World!' as greeting")
			.one() as { greeting: string };
		return result.greeting;
	}

	/** Example: resilient fetch to external API from within Durable Object */
	async fetchExternalData(url: string): Promise<any> {
		const env = this.env as Env;
		const response = await fetchRetry(url, {
			retries: env.RETRY_ATTEMPTS,
			timeoutMs: env.API_TIMEOUT_MS,
			circuitBreaker: {
				failureThreshold: 5,
				resetTimeoutMs: 30000,
				halfOpenRequests: 2,
			},
		});
		return response.json();
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Validate environment at startup
		const validatedEnv = envAssert({
			API_BASE_URL: { type: 'string', required: true },
			API_TIMEOUT_MS: { type: 'number', default: 5000 },
			RETRY_ATTEMPTS: { type: 'number', default: 3 },
		}, env);

		const id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName(
			new URL(request.url).pathname,
		);

		const stub = env.MY_DURABLE_OBJECT.get(id);

		const greeting = await stub.sayHello();

		return new Response(greeting);
	},
} satisfies ExportedHandler<Env>;

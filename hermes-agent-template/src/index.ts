import { createRemoteJWKSet, jwtVerify } from "jose";

export { HermesSandbox } from "./sandbox";
export { Outbound } from "./outbound";

const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export default {
	async fetch(request, env): Promise<Response> {
		if (
			!env.ACCESS_TEAM_DOMAIN ||
			env.ACCESS_TEAM_DOMAIN.startsWith("YOUR-") ||
			!env.ACCESS_AUD ||
			env.ACCESS_AUD.startsWith("YOUR-") ||
			!env.AI_GATEWAY_ID
		) {
			// The setup page never starts a container or bypasses Access verification.
			if (new URL(request.url).pathname === "/" && request.method === "GET") {
				return new Response(
					`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Set up Hermes Agent</title>
<style>body{font:18px/1.6 system-ui,sans-serif;max-width:48rem;margin:10vh auto;padding:0 1.5rem;color:#1f2937}code{background:#f3f4f6;padding:.15em .3em;border-radius:4px}a{color:#b45309}</style></head>
<body><h1>Set up Hermes Agent</h1><p>Configure Cloudflare Access and AI Gateway before opening your coding workspace.</p>
<ol><li>Create an Access application for this Worker's hostname and allow your intended users.</li><li>Set <code>ACCESS_TEAM_DOMAIN</code> and <code>ACCESS_AUD</code> in <code>wrangler.jsonc</code>.</li><li>Set <code>AI_GATEWAY_ID</code> to a gateway with Unified Billing configured for your model, then redeploy.</li></ol>
<p><a href="https://developers.cloudflare.com/sandbox/coding-agents/hermes/">Follow the Hermes setup guide</a></p><p>No container has been started. Your workspace will be temporary: export files before its container stops.</p></body></html>`,
					{
						headers: {
							"Content-Type": "text/html; charset=utf-8",
							"Cache-Control": "no-store",
						},
					},
				);
			}
			return new Response("Configure Access and AI Gateway first", {
				status: 503,
			});
		}
		const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
		let keys = keysets.get(issuer);
		if (!keys) {
			keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
			keysets.set(issuer, keys);
		}
		let identity: string;
		try {
			const { payload } = await jwtVerify(
				request.headers.get("Cf-Access-Jwt-Assertion") ?? "",
				keys,
				{
					issuer,
					audience: env.ACCESS_AUD,
					algorithms: ["RS256"],
					requiredClaims: ["exp"],
				},
			);
			// Service tokens also support automated tests when an Access policy allows them.
			if (typeof payload.sub === "string" && payload.sub)
				identity = `user:${payload.sub}`;
			else if (typeof payload.common_name === "string" && payload.common_name)
				identity = `service:${payload.common_name}`;
			else throw new Error("Missing identity");
		} catch {
			return new Response("Unauthorized", { status: 401 });
		}
		const url = new URL(request.url);
		const origin = request.headers.get("Origin");
		if (origin && origin !== url.origin)
			return new Response("Cross-origin requests are disabled", {
				status: 403,
			});
		if (url.pathname === "/auth/logout")
			return Response.redirect(`${url.origin}/cdn-cgi/access/logout`, 302);
		// Only verified identities choose a container; paths and caller headers cannot.
		return env.SANDBOX.get(env.SANDBOX.idFromName(identity)).fetch(request);
	},
} satisfies ExportedHandler<Env>;

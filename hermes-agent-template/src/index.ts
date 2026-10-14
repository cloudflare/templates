export { HermesSandbox } from "./sandbox";
export { Outbound } from "./outbound";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		if (!ctx.access || !env.AI_GATEWAY_ID) {
			if (url.pathname === "/" && request.method === "GET") {
				return new Response(
					`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Set up Hermes Agent</title>
<h1>Set up Hermes Agent</h1><p>Protect this hostname with Cloudflare Access and configure AI Gateway.</p>
<p><a href="https://developers.cloudflare.com/sandbox/coding-agents/hermes/">Follow the Hermes setup guide</a></p></html>`,
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
		let userId: string | undefined;
		try {
			userId = (await ctx.access.getIdentity())?.user_uuid;
		} catch {
			return new Response("Unauthorized", { status: 401 });
		}
		if (!userId) return new Response("Unauthorized", { status: 401 });
		const origin = request.headers.get("Origin");
		if (origin && origin !== url.origin)
			return new Response("Cross-origin requests are disabled", {
				status: 403,
			});
		if (url.pathname === "/auth/logout")
			return Response.redirect(`${url.origin}/cdn-cgi/access/logout`, 302);
		// Only the identity supplied by Access chooses a container.
		return env.SANDBOX.get(env.SANDBOX.idFromName(`user:${userId}`)).fetch(
			request,
		);
	},
} satisfies ExportedHandler<Env>;

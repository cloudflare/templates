export default {
	fetch(request: Request): Response {
		const url = new URL(request.url);
		return new Response(
			`<!doctype html><h1>Worker A</h1><p>${url.pathname}</p><img src="/assets/logo.png">`,
			{ headers: { "content-type": "text/html" } },
		);
	},
};

export default {
	fetch(request: Request): Response {
		const url = new URL(request.url);
		return new Response(
			`<!doctype html><h1>Worker B</h1><p>${url.pathname}</p>`,
			{
				headers: { "content-type": "text/html" },
			},
		);
	},
};

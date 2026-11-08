export default {
	async fetch(request, env) {
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
				},
			});
		}

		if (request.method !== "POST") {
			return Response.json(
				{ error: 'Send a POST request with { "targetUrl": "https://example.com" }' },
				{ status: 405 },
			);
		}

		let body;
		try {
			body = await request.json();
		} catch {
			return Response.json({ error: "Invalid JSON body" }, { status: 400 });
		}

		const { targetUrl } = body;
		if (!targetUrl) {
			return Response.json(
				{ error: 'Missing "targetUrl" field' },
				{ status: 400 },
			);
		}

		const response = await fetch("https://api.sed.sh/links", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.SED_SH_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ targetUrl }),
		});

		const result = await response.json();
		return Response.json(result, {
			status: response.status,
			headers: { "Access-Control-Allow-Origin": "*" },
		});
	},
};

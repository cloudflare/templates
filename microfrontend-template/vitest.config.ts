import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

// Stub Worker A - Returns HTML with asset references for testing URL rewriting
const workerAScript = /* javascript */ `
export default {
	async fetch(request) {
		const url = new URL(request.url);
		const html = \`<!DOCTYPE html>
<html>
<head>
	<title>Worker A</title>
	<link rel="stylesheet" href="/assets/style.css">
	<link rel="icon" href="/favicon.ico">
</head>
<body>
	<h1>Worker A</h1>
	<p>Path: \${url.pathname}</p>
	<img src="/assets/logo.png" alt="Logo">
	<script src="/static/app.js"></script>
</body>
</html>\`;
		return new Response(html, {
			headers: { "Content-Type": "text/html" },
		});
	},
};
`;

// Stub Worker B - Returns HTML and handles redirects/cookies for testing
const workerBScript = /* javascript */ `
export default {
	async fetch(request) {
		const url = new URL(request.url);

		// Test redirect handling
		if (url.pathname === "/redirect-test") {
			return new Response(null, {
				status: 302,
				headers: { Location: "/redirected" },
			});
		}

		// Test cookie path handling
		if (url.pathname === "/set-cookie") {
			return new Response("Cookie set", {
				headers: { "Set-Cookie": "session=abc123; Path=/" },
			});
		}

		const html = \`<!DOCTYPE html>
<html>
<head>
	<title>Worker B</title>
	<link rel="stylesheet" href="/build/style.css">
</head>
<body>
	<h1>Worker B</h1>
	<p>Path: \${url.pathname}</p>
	<img src="/assets/image.png" alt="Image">
</body>
</html>\`;
		return new Response(html, {
			headers: { "Content-Type": "text/html" },
		});
	},
};
`;

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
				miniflare: {
					workers: [
						{
							name: "worker-a",
							modules: [
								{ type: "ESModule", path: "index.js", contents: workerAScript },
							],
							compatibilityDate: "2024-01-01",
						},
						{
							name: "worker-b",
							modules: [
								{ type: "ESModule", path: "index.js", contents: workerBScript },
							],
							compatibilityDate: "2024-01-01",
						},
					],
				},
			},
		},
	},
});

import puppeteer from "@cloudflare/puppeteer";

const HOME_PAGE = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Browser Rendering Screenshots</title>
		<style>
			body {
				font-family: system-ui, sans-serif;
				max-width: 40rem;
				margin: 4rem auto;
				padding: 0 1rem;
				line-height: 1.5;
			}
			form {
				display: flex;
				gap: 0.5rem;
				margin-top: 1.5rem;
			}
			input {
				flex: 1;
				padding: 0.5rem 0.75rem;
				font-size: 1rem;
			}
			button {
				padding: 0.5rem 1rem;
				font-size: 1rem;
				cursor: pointer;
			}
			code {
				background: #f2f2f2;
				padding: 0.1rem 0.3rem;
				border-radius: 0.25rem;
			}
		</style>
	</head>
	<body>
		<h1>Browser Rendering Screenshots</h1>
		<p>
			Enter a URL and this Worker will launch a headless browser with
			<a href="https://developers.cloudflare.com/browser-rendering/">Browser Rendering</a>,
			navigate to the page, and return a JPEG screenshot.
		</p>
		<form action="/" method="get">
			<input
				type="url"
				name="url"
				placeholder="https://example.com"
				required
			/>
			<button type="submit">Screenshot</button>
		</form>
		<p>Or call it directly: <code>/?url=https://example.com</code></p>
	</body>
</html>
`;

export default {
	async fetch(request, env): Promise<Response> {
		const { searchParams } = new URL(request.url);
		const target = searchParams.get("url");

		// No URL provided: serve a small form to drive the screenshot endpoint.
		if (!target) {
			return new Response(HOME_PAGE, {
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		}

		// Validate the requested URL before handing it to the browser. `new URL()`
		// also accepts schemes like `javascript:`, `data:`, and `file:`, so we
		// must explicitly restrict to http(s). Note: this Worker screenshots
		// arbitrary user-supplied URLs — if you adapt it for production, consider
		// an allowlist or other SSRF mitigations.
		let parsed: URL;
		try {
			parsed = new URL(target);
		} catch {
			return new Response(
				"Invalid `url` parameter. Example: /?url=https://example.com",
				{ status: 400 },
			);
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return new Response("Only http and https URLs are supported.", {
				status: 400,
			});
		}

		const browser = await puppeteer.launch(env.BROWSER);
		try {
			const page = await browser.newPage();
			await page.goto(parsed.toString(), {
				waitUntil: "networkidle0",
				timeout: 15_000,
			});
			const screenshot = (await page.screenshot({
				type: "jpeg",
				quality: 80,
			})) as Uint8Array;

			return new Response(screenshot, {
				headers: {
					"content-type": "image/jpeg",
					"cache-control": "public, max-age=3600",
				},
			});
		} catch {
			// Navigation timed out or the page failed to load.
			return new Response(
				"Failed to load the page. It may be too slow or unavailable.",
				{ status: 504 },
			);
		} finally {
			// Always release the browser session, even if navigation fails.
			await browser.close();
		}
	},
} satisfies ExportedHandler<Env>;

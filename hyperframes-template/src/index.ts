import { getContainer } from "@cloudflare/containers";
import { RenderContainer } from "./container.js";
import manifest from "./composition-manifest.json";

export { RenderContainer };

interface Env {
	ASSETS: Fetcher;
	RENDER_CONTAINER: DurableObjectNamespace<RenderContainer>;
	RENDERS: R2Bucket;
}

const PREVIEW_HEADERS = {
	"content-type": "text/html; charset=utf-8",
	"cache-control": "no-store",
	"content-security-policy": "frame-ancestors 'self'; object-src 'none'",
};

function fetchAsset(env: Env, path: string): Promise<Response> {
	return env.ASSETS.fetch(new Request(`http://assets/${path}`));
}

async function handlePreview(env: Env): Promise<Response> {
	const res = await fetchAsset(env, "_bundled/preview.html");
	if (!res.ok)
		return new Response("preview bundle missing — run build", { status: 500 });
	return new Response(res.body, { headers: PREVIEW_HEADERS });
}

async function loadCompositionFiles(
	env: Env,
): Promise<Array<{ path: string; content: string }>> {
	return Promise.all(
		manifest.files.map(async (rel) => {
			const res = await fetchAsset(env, `${manifest.dir}/${rel}`);
			if (!res.ok) throw new Error(`asset missing: ${rel} (${res.status})`);
			const buf = new Uint8Array(await res.arrayBuffer());
			return { path: rel, content: bufferToBase64(buf) };
		}),
	);
}

function bufferToBase64(bytes: Uint8Array): string {
	let bin = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(bin);
}

async function handleRender(env: Env, req: Request): Promise<Response> {
	const t0 = Date.now();
	let files;
	try {
		files = await loadCompositionFiles(env);
	} catch (err) {
		return jsonError(`failed to load composition: ${msg(err)}`, 500);
	}

	const container = getContainer(env.RENDER_CONTAINER, "renderer");
	let containerRes;
	try {
		containerRes = await container.fetch(
			new Request("http://container/render", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ files }),
			}),
		);
	} catch (err) {
		return jsonError(`container unavailable: ${msg(err)}`, 502);
	}

	if (!containerRes.ok) {
		const body = await containerRes.text().catch(() => "");
		return jsonError(`render failed (${containerRes.status}): ${body}`, 502);
	}

	const key = `renders/${Date.now()}-${crypto.randomUUID()}.mp4`;
	await env.RENDERS.put(key, containerRes.body, {
		httpMetadata: { contentType: "video/mp4" },
	});

	const url = new URL(req.url);
	url.pathname = `/r/${key}`;

	return Response.json({
		url: url.toString(),
		key,
		durationMs: Date.now() - t0,
	});
}

async function handleR2Get(env: Env, key: string): Promise<Response> {
	const obj = await env.RENDERS.get(key);
	if (!obj) return new Response("not found", { status: 404 });
	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set("etag", obj.httpEtag);
	headers.set("cache-control", "public, max-age=31536000, immutable");
	return new Response(obj.body, { headers });
}

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}

function msg(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		const { pathname } = url;

		if (req.method === "POST" && pathname === "/api/render") {
			return handleRender(env, req);
		}

		if (req.method === "GET" && pathname === "/api/preview") {
			return handlePreview(env);
		}

		if (req.method === "GET" && pathname.startsWith("/r/")) {
			const key = pathname.slice("/r/".length);
			return handleR2Get(env, key);
		}

		return env.ASSETS.fetch(req);
	},
};

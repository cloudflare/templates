// HTTP server inside the Cloudflare Container.
// POST /render { files: [{ path, content: base64 }] } → 200 video/mp4 | 500 json{error}
// GET  /healthz → 200 "ok"

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const PORT = Number(process.env.PORT ?? 8080);
const RENDER_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_GRACE_MS = 5_000;
const HYPERFRAMES_BIN = resolve("node_modules/.bin/hyperframes");

function readBody(req, max = 200 * 1024 * 1024) {
	return new Promise((resolveBody, reject) => {
		const chunks = [];
		let total = 0;
		req.on("data", (chunk) => {
			total += chunk.length;
			if (total > max) {
				reject(new Error(`request body exceeded ${max} bytes`));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolveBody(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}

// Reject paths that escape the workdir before any fs touch — the Worker's
// file list is trusted, but path traversal is the kind of footgun that's
// cheaper to reject everywhere than to reason about per-caller.
function safeJoin(root, rel) {
	const abs = resolve(root, rel);
	const rootSep = root.endsWith(sep) ? root : root + sep;
	if (!abs.startsWith(rootSep)) {
		throw new Error(`path escapes root: ${rel}`);
	}
	return abs;
}

function writeFiles(workdir, files) {
	return Promise.all(
		files.map(async (f) => {
			const abs = safeJoin(workdir, f.path);
			await mkdir(dirname(abs), { recursive: true });
			await writeFile(abs, Buffer.from(f.content, "base64"));
		}),
	);
}

function runRender(compDir, outFile) {
	return new Promise((resolveRun, reject) => {
		const child = spawn(
			HYPERFRAMES_BIN,
			["render", compDir, "-o", outFile, "--workers", "auto"],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);

		const stderrChunks = [];
		child.stdout.on("data", (d) => process.stdout.write(d));
		child.stderr.on("data", (d) => {
			stderrChunks.push(d);
			process.stderr.write(d);
		});

		let killTimer = null;
		const timeoutTimer = setTimeout(() => {
			child.kill("SIGTERM");
			killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
			reject(new Error(`render timed out after ${RENDER_TIMEOUT_MS}ms`));
		}, RENDER_TIMEOUT_MS);

		child.on("error", (err) => {
			clearTimeout(timeoutTimer);
			if (killTimer) clearTimeout(killTimer);
			reject(err);
		});

		child.on("close", (code) => {
			clearTimeout(timeoutTimer);
			if (killTimer) clearTimeout(killTimer);
			if (code === 0) resolveRun();
			else
				reject(
					new Error(
						`hyperframes render exited ${code}\n${Buffer.concat(stderrChunks).toString()}`,
					),
				);
		});
	});
}

async function handleRender(req, res) {
	const t0 = Date.now();
	const workRoot = await mkdtemp(join(tmpdir(), "render-"));
	const compDir = join(workRoot, "composition");
	const outFile = join(workRoot, "out.mp4");
	await mkdir(compDir, { recursive: true });

	try {
		const raw = await readBody(req);
		const body = JSON.parse(raw.toString("utf8"));
		if (!Array.isArray(body?.files) || body.files.length === 0) {
			throw new Error("body.files must be a non-empty array");
		}
		await writeFiles(compDir, body.files);

		await runRender(compDir, outFile);
		const { size } = await stat(outFile);

		res.writeHead(200, {
			"content-type": "video/mp4",
			"content-length": size,
			"x-render-duration-ms": String(Date.now() - t0),
		});
		createReadStream(outFile)
			.on("error", (err) => res.destroy(err))
			.pipe(res)
			.on("close", () => {
				rm(workRoot, { recursive: true, force: true }).catch(() => {});
			});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[render] failed", message);
		res.writeHead(500, { "content-type": "application/json" });
		res.end(JSON.stringify({ error: message }));
		rm(workRoot, { recursive: true, force: true }).catch(() => {});
	}
}

const server = createServer(async (req, res) => {
	if (req.method === "GET" && req.url === "/healthz") {
		res.writeHead(200, { "content-type": "text/plain" });
		res.end("ok");
		return;
	}
	if (req.method === "POST" && req.url === "/render") {
		await handleRender(req, res);
		return;
	}
	res.writeHead(404, { "content-type": "text/plain" });
	res.end("not found");
});

server.listen(PORT, () => {
	console.log(`[render-server] listening on :${PORT}`);
});

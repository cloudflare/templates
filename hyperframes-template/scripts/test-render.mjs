// Usage: node scripts/test-render.mjs <port> <output.mp4>

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv } from "node:process";

const port = Number(argv[2] ?? 18080);
const outFile = argv[3] ?? "/tmp/test-render.mp4";

const manifest = JSON.parse(
	await readFile("src/composition-manifest.json", "utf8"),
);
const compRoot = join("public", manifest.dir);

const files = await Promise.all(
	manifest.files.map(async (rel) => ({
		path: rel,
		content: (await readFile(join(compRoot, rel))).toString("base64"),
	})),
);

console.log(`[test] sending ${files.length} files to localhost:${port}/render`);
const t0 = Date.now();

const res = await fetch(`http://localhost:${port}/render`, {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify({ files }),
});

if (!res.ok) {
	const body = await res.text();
	console.error(`[test] FAIL ${res.status}: ${body}`);
	process.exit(1);
}

const mp4 = Buffer.from(await res.arrayBuffer());
await writeFile(outFile, mp4);

console.log(
	`[test] OK in ${Date.now() - t0}ms — wrote ${mp4.length} bytes to ${outFile} (server reported ${res.headers.get("x-render-duration-ms")}ms)`,
);

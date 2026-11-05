import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { checkFrameworkSourceMaps } from "../src/sourceMaps";

let root: string;
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "template-source-maps-"));
	fs.mkdirSync(path.join(root, ".wrangler/deploy"), { recursive: true });
	fs.mkdirSync(path.join(root, "dist/worker"), { recursive: true });
	fs.writeFileSync(
		path.join(root, "wrangler.jsonc"),
		'{"main":"src/index.ts","upload_source_maps":true}',
	);
	fs.writeFileSync(
		path.join(root, ".wrangler/deploy/config.json"),
		'{"configPath":"../../dist/worker/wrangler.json"}',
	);
	fs.writeFileSync(
		path.join(root, "dist/worker/wrangler.json"),
		'{"main":"index.js","upload_source_maps":true,"assets":{"directory":"../client"}}',
	);
	fs.writeFileSync(
		path.join(root, "dist/worker/index.js"),
		'throw new Error("original source");\n//# sourceMappingURL=index.js.map',
	);
	fs.writeFileSync(
		path.join(root, "dist/worker/index.js.map"),
		JSON.stringify({
			version: 3,
			sources: ["../../src/index.ts"],
			mappings: "AAAA",
		}),
	);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test("validates the built config and external Worker maps", () => {
	expect(() => checkFrameworkSourceMaps(root)).not.toThrow();
});
test("rejects uploads disabled in the generated config", () => {
	fs.writeFileSync(
		path.join(root, "dist/worker/wrangler.json"),
		'{"upload_source_maps":false}',
	);
	expect(() => checkFrameworkSourceMaps(root)).toThrow(
		"Built Worker must enable upload_source_maps",
	);
});
test("rejects missing maps despite the upload flag", () => {
	fs.rmSync(path.join(root, "dist/worker/index.js.map"));
	expect(() => checkFrameworkSourceMaps(root)).toThrow(
		"references a missing source map",
	);
});
test("rejects builds with no map references", () => {
	fs.writeFileSync(
		path.join(root, "dist/worker/index.js"),
		"export default {};",
	);
	expect(() => checkFrameworkSourceMaps(root)).toThrow(
		"No external Worker source maps found",
	);
});
test("rejects builds containing only empty maps", () => {
	fs.writeFileSync(
		path.join(root, "dist/worker/index.js.map"),
		'{"version":3,"sources":[],"mappings":""}',
	);
	expect(() => checkFrameworkSourceMaps(root)).toThrow(
		"No external Worker source maps found",
	);
});
test("requires server maps to be excluded from public assets", () => {
	fs.writeFileSync(
		path.join(root, "dist/worker/wrangler.json"),
		'{"upload_source_maps":true,"assets":{"directory":".."}}',
	);
	expect(() => checkFrameworkSourceMaps(root)).toThrow(
		"server map is inside public assets",
	);
	fs.writeFileSync(path.join(root, "dist/.assetsignore"), "worker\n");
	expect(() => checkFrameworkSourceMaps(root)).not.toThrow();
});

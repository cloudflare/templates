import fs from "node:fs";

const prePushHook = `
#!/bin/bash
pnpm run fix`.trim();

export function setupHooks() {
	fs.writeFileSync(".git/hooks/pre-push", prePushHook, {
		encoding: "utf-8",
		mode: 0o755,
	});
}

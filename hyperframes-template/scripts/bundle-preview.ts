// Run via tsx, not node — @hyperframes/core uses extensionless ESM imports
// that vanilla node can't resolve. Usage: tsx bundle-preview.ts <dir>

import { bundleToSingleHtml } from "@hyperframes/core/compiler";

const projectDir = process.argv[2];
if (!projectDir) {
	console.error("Usage: tsx scripts/bundle-preview.ts <project-dir>");
	process.exit(1);
}

const html = await bundleToSingleHtml(projectDir);
process.stdout.write(html);

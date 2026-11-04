import "zx/globals";
import subprocess from "node:child_process";
import MarkdownError from "./MarkdownError";
import { getPublishedTemplates } from "./util";

export type DeployLiveDemosConfig = {
	templateDirectory: string;
	concurrency?: number;
};

const DEFAULT_CONCURRENCY = 6;

const STEPS: [string, string[]][] = [
	["npm", ["install", "--force"]],
	["npm", ["run", "build", "--if-present"]],
	["npm", ["run", "deploy"]],
];

function runCommand(
	file: string,
	args: string[],
	cwd: string,
	log: string[],
): Promise<void> {
	const command = [file, ...args].join(" ");
	log.push(`Running: ${command} in ${cwd}`);
	return new Promise((resolve, reject) => {
		subprocess.execFile(
			file,
			args,
			{ cwd, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (stdout) log.push(stdout);
				if (stderr) log.push(stderr);
				if (error) {
					log.push(`✗ Failed: ${command} in ${cwd}`);
					reject(error);
				} else {
					log.push(`✓ Success: ${command}`);
					resolve();
				}
			},
		);
	});
}

// Templates deploy in parallel, so each one's output is buffered and printed
// as a single block when it finishes.
function printLog(name: string, log: string[]) {
	const grouped = process.env.GITHUB_ACTIONS === "true";
	console.log(grouped ? `::group::${name}` : `--- ${name} ---`);
	console.log(log.join("\n"));
	if (grouped) console.log("::endgroup::");
}

export default async function deployLiveDemos({
	templateDirectory,
	concurrency = DEFAULT_CONCURRENCY,
}: DeployLiveDemosConfig) {
	const templates = getPublishedTemplates(templateDirectory);
	const failed: string[] = [];
	const queue = [...templates];

	// Deploy every template even if one fails, so a single broken demo
	// doesn't leave the rest stale.
	async function worker() {
		for (let template = queue.shift(); template; template = queue.shift()) {
			const log: string[] = [];
			try {
				for (const [file, args] of STEPS) {
					await runCommand(file, args, template.path, log);
				}
			} catch {
				failed.push(template.name);
			}
			printLog(template.name, log);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, templates.length) }, worker),
	);

	const deployed = templates.length - failed.length;
	if (failed.length) {
		throw new MarkdownError(
			`Failed to deploy ${failed.length} of ${templates.length} live demos.`,
			[
				`Deployed ${deployed} of ${templates.length} live demos. Failed:`,
				...failed.sort().map((name) => `- ❌ ${name}`),
			].join("\n"),
		);
	}
	return `Deployed ${deployed} of ${templates.length} live demos.`;
}

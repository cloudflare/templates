import "zx/globals";
import subprocess from "node:child_process";
import MarkdownError from "./MarkdownError";
import { getPublishedTemplates } from "./util";

export type DeployLiveDemosConfig = {
	templateDirectory: string;
};

function runCommand(command: string, cwd: string) {
	console.log(`Running: ${command} in ${cwd}`);
	try {
		const result = subprocess.execSync(command, {
			cwd,
			stdio: "inherit",
			encoding: "utf-8",
		});
		console.log(`✓ Success: ${command}`);
		return result;
	} catch (error) {
		console.error(`✗ Failed: ${command} in ${cwd}`);
		if (error && typeof error === "object" && "stdout" in error) {
			console.error("STDOUT:", (error as any).stdout?.toString());
			console.error("STDERR:", (error as any).stderr?.toString());
		}
		throw error;
	}
}

export default async function deployLiveDemos({
	templateDirectory,
}: DeployLiveDemosConfig) {
	const templates = getPublishedTemplates(templateDirectory);
	const failed: string[] = [];
	// Deploy every template even if one fails, so a single broken demo
	// doesn't leave the rest stale.
	for (const { name, path: templatePath } of templates) {
		try {
			runCommand("npm install --force", templatePath);
			runCommand("npm run build --if-present", templatePath);
			runCommand("npm run deploy", templatePath);
		} catch {
			failed.push(name);
		}
	}
	const deployed = templates.length - failed.length;
	if (failed.length) {
		throw new MarkdownError(
			`Failed to deploy ${failed.length} of ${templates.length} live demos.`,
			[
				`Deployed ${deployed} of ${templates.length} live demos. Failed:`,
				...failed.map((name) => `- ❌ ${name}`),
			].join("\n"),
		);
	}
	return `Deployed ${deployed} of ${templates.length} live demos.`;
}

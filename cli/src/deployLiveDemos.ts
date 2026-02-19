import "zx/globals";
import subprocess from "node:child_process";
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
	await Promise.all(
		templates.map(({ path: templatePath }) => {
			runCommand("npm install", templatePath);
			runCommand("npm run build --if-present", templatePath);
			runCommand("npm run deploy", templatePath);
		}),
	);
}

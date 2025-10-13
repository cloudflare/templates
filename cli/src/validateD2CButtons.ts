import fs from "node:fs";
import path from "node:path";
import { getAllTemplates } from "./util";
import MarkdownError from "./MarkdownError";

export type ValidateD2CButtonsConfig = {
	templateDirectory: string;
};

export async function validateD2CButtons({
	templateDirectory,
}: ValidateD2CButtonsConfig) {
	const templates = getAllTemplates(templateDirectory);
	const successes: string[] = [];
	const errors: string[] = [];
	let numBadStatuses = 0;
	await Promise.all(
		templates.map(async ({ name }) => {
			const readmePath = path.join(templateDirectory, name, "README.md");
			const contents = fs.readFileSync(readmePath, "utf-8");
			const url = `https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/${name}`;
			const button = `[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](${url})`;
			if (contents.indexOf(button) === -1) {
				numBadStatuses++;
				errors.push(
					`Please add the following to \`${name}/README.md\`:`,
					["```md", button, "```"].join("\n"),
				);
			} else {
				successes.push(`- ✅ [${name}](${url})`);
			}
		}),
	);
	if (errors.length) {
		throw new MarkdownError(
			`Found ${numBadStatuses} ${numBadStatuses === 1 ? "template" : "templates"} without valid Deploy to Cloudflare links in \`README.md\`.`,
			errors.join("\n\n"),
		);
	}
	return successes.join("\n");
}

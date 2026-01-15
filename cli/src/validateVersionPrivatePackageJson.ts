import fs from "node:fs";
import path from "node:path";
import { getAllTemplates } from "./util";
import MarkdownError from "./MarkdownError";

export type ValidateVersionPrivatePackageJsonConfig = {
	templateDirectory: string;
};

export async function validateVersionPrivatePackageJson({
	templateDirectory,
}: ValidateVersionPrivatePackageJsonConfig) {
	const templates = getAllTemplates(templateDirectory);
	const successes: string[] = [];
	const errors: string[] = [];
	let numBadStatuses = 0;
	await Promise.all(
		templates.map(async ({ name }) => {
			const readmePath = path.join(templateDirectory, name, "package.json");
			try {
				const contents = fs.readFileSync(readmePath, "utf-8");
				const data = JSON.parse(contents);
				let fileError = false;
				if (!("private" in data) || data.private !== true) {
					numBadStatuses++;
					fileError = true;
					errors.push(
						`Please set \`private: true\` in \`${name}/package.json\`.`,
					);
				}
				if ("version" in data) {
					numBadStatuses++;
					fileError = true;
					errors.push(`Please remove \`version\` in \`${name}/package.json\`.`);
				}

				if (!fileError) {
					successes.push(
						`- ✅ ${name} has \`private: true\` and no \`version\`.`,
					);
				}
			} catch (error) {
				if (
					error instanceof Error &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					// Swallow error if package.json doesn't exist
					return;
				}

				throw error;
			}
		}),
	);
	if (errors.length) {
		throw new MarkdownError(
			`Found ${numBadStatuses} ${numBadStatuses === 1 ? "template" : "templates"} with invalid \`package.json\` files.`,
			errors.join("\n\n"),
		);
	}
	return successes.join("\n");
}

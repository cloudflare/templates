import { getPublishedTemplates } from "./util";
import MarkdownError from "./MarkdownError";
import { execFileSync } from "node:child_process";

export type ValidateLiveDemoLinksConfig = {
	templateDirectory: string;
};

function isNewPullRequestTemplate(name: string): boolean {
	if (!process.env.GITHUB_BASE_REF) {
		return false;
	}

	try {
		execFileSync("git", ["cat-file", "-e", `HEAD^1:${name}/package.json`], {
			stdio: "ignore",
		});
		return false;
	} catch {
		return true;
	}
}

export async function validateLiveDemoLinks({
	templateDirectory,
}: ValidateLiveDemoLinksConfig) {
	const templates = getPublishedTemplates(templateDirectory);
	const successes: string[] = [];
	const errors: string[] = [];
	let numBadStatuses = 0;
	await Promise.all(
		templates.map(async ({ name }) => {
			const execute = async (retried = false) => {
				const url = `https://${name}.templates.workers.dev`;
				const response = await fetch(url);
				if (!response.ok) {
					// A newly published template cannot have a live demo until the
					// trusted post-merge workflow deploys it with Cloudflare credentials.
					if (response.status === 404 && isNewPullRequestTemplate(name)) {
						successes.push(`- ⏭️ ${url} (new template; deploys after merge)`);
						return;
					}

					if (!retried) {
						/**
						 * For brand new workers, it may take some time for dns to propagate.
						 */
						await new Promise((resolve) => setTimeout(resolve, 15_000));
						return execute(true);
					}
					numBadStatuses++;
					errors.push(`- ❌ ${url} => ${response.status}`);
					if (response.status === 404) {
						errors.push(
							"  - Please have collaborator provision this live demo.",
						);
					}
				} else {
					successes.push(`- ✅ ${url}`);
				}
			};
			return execute();
		}),
	);
	if (errors.length) {
		throw new MarkdownError(
			`Found ${numBadStatuses} ${numBadStatuses === 1 ? "template" : "templates"} with invalid live demo links.`,
			errors.join("\n"),
		);
	}
	return successes.join("\n");
}

import { getPublishedTemplates } from "./util";
import MarkdownError from "./MarkdownError";

export type ValidateLiveDemoLinksConfig = {
	templateDirectory: string;
};

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

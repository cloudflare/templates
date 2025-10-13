import { commentOnPR } from "./util";
import MarkdownError from "./MarkdownError";
import { upload, UploadConfig } from "./upload";

export type PreviewConfig = UploadConfig & {
	prId: string;
	githubToken: string;
};
export async function preview(config: PreviewConfig) {
	const headRepo = `${config.seedRepo.owner}/${config.seedRepo.repository}`;
	if (
		process.env.GITHUB_REPOSITORY !== headRepo &&
		!process.env.PR_ALLOW_PREVIEW
	) {
		console.warn(
			`Preview links are not generated for forks (${headRepo}) without the \`${process.env.ALLOW_PREVIEW_LABEL}\` label.`,
		);
		return commentOnPR({
			...config,
			body: [
				"Preview link not generated: you must be on a branch, not on a fork.",
				`Collaborators may enable previews for this pull request by attaching the \`${process.env.ALLOW_PREVIEW_LABEL}\` label.`,
				"If you are already a collaborator, please create a branch rather than forking.",
			].join("\n"),
		});
	}
	try {
		await upload(config);
		return commentOnPR({
			...config,
			body: previewLinkBody(config),
		});
	} catch (err) {
		throw new MarkdownError(
			"Could not create preview.",
			(err as Error).message,
		);
	}
}

function previewLinkBody(config: PreviewConfig) {
	const url = new URL("https://dash.cloudflare.com");
	url.searchParams.set(
		"to",
		`/:account/workers-and-pages/template-preview/${config.version}`,
	);
	return `[Dashboard preview link](${url})`;
}

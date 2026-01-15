import {
	collectTemplateFiles,
	fetchWithRetries,
	getPublishedTemplates,
	handleCloudflareResponse,
	SeedRepo,
} from "./util";
import MarkdownError from "./MarkdownError";

export type UploadConfig = {
	templateDirectory: string;
	seedRepo: SeedRepo;
	version: string;
	latest?: boolean;
	api: {
		endpoint: string;
		clientId: string;
		clientSecret: string;
	};
};

export async function upload(config: UploadConfig) {
	const templates = getPublishedTemplates(config.templateDirectory);
	const formData = templates.reduce((body, template) => {
		const files = collectTemplateFiles(template.path, !!config.seedRepo);
		console.info(`Uploading ${template.path}:`);
		files.forEach(({ file, filePath }) => {
			console.info(`  - ${filePath}`);
			if (
				process.env.PREVIEW_DIR &&
				filePath.startsWith(process.env.PREVIEW_DIR)
			) {
				body.set(filePath.replace(`${process.env.PREVIEW_DIR}/`, ""), file);
			} else {
				body.set(filePath, file);
			}
		});
		return body;
	}, new FormData());
	await uploadTemplates(formData, config);
	return templates.map(({ name }) => `- ✅ ${name}`).join("\n");
}

async function uploadTemplates(body: FormData, config: UploadConfig) {
	const queryParams = new URLSearchParams(config.seedRepo);
	queryParams.set("version", config.version);
	if (config.latest) {
		queryParams.set("latest", `${true}`);
	}
	const response = await fetchWithRetries(
		`${config.api.endpoint}?${queryParams}`,
		{
			method: "POST",
			headers: {
				"Cf-Access-Client-Id": config.api.clientId,
				"Cf-Access-Client-Secret": config.api.clientSecret,
			},
			body,
		},
	);
	return handleCloudflareResponse(response);
}

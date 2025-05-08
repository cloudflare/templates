import {
  collectTemplateFiles,
  getTemplates,
  handleCloudflareResponse,
  SeedRepo,
} from "./util";
import MarkdownError from "./MarkdownError";

export type UploadConfig = {
  templateDirectory: string;
  seedRepo: SeedRepo;
  api: {
    endpoint: string;
    clientId: string;
    clientSecret: string;
  };
};

export async function upload(config: UploadConfig) {
  const templates = getTemplates(config.templateDirectory);
  const successes: string[] = [];
  const errors: string[] = [];
  await Promise.all(
    templates.map(async ({ path }) => {
      try {
        await uploadTemplate(path, config);
        successes.push(`- ✅ ${path}`);
      } catch (err) {
        errors.push(`- ❌ ${path} failed: ${(err as Error).message}`);
      }
    }),
  );
  if (errors.length > 0) {
    throw new MarkdownError("Upload failed.", errors.join("\n"));
  }
  return successes.join("\n");
}

async function uploadTemplate(templatePath: string, config: UploadConfig) {
  const files = collectTemplateFiles(templatePath, !!config.seedRepo);
  console.info(`Uploading ${templatePath}:`);
  const body = new FormData();
  files.forEach((file) => {
    console.info(`  - ${file.name}`);
    body.set(file.name, file);
  });
  const queryParams = new URLSearchParams(config.seedRepo);
  queryParams.set("path", templatePath);
  const response = await fetch(`${config.api.endpoint}?${queryParams}`, {
    method: "POST",
    headers: {
      "Cf-Access-Client-Id": config.api.clientId,
      "Cf-Access-Client-Secret": config.api.clientSecret,
    },
    body,
  });
  return handleCloudflareResponse(response);
}

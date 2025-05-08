import { collectTemplateFiles, getTemplates, SeedRepo } from "./util";

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
  const errors = [];
  for (const { path } of templates) {
    try {
      await uploadTemplate(path, config);
    } catch (e) {
      errors.push(`Upload ${path} failed: ${e}`);
    }
  }
  if (errors.length > 0) {
    errors.forEach((error) => {
      console.error(error);
    });
    process.exit(1);
  }
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
  if (!response.ok) {
    throw new Error(
      `Error response from ${config.api.endpoint} (${response.status}): ${await response.text()}`,
    );
  }
}

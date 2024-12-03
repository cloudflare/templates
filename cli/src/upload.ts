import fs from "node:fs";
import path from "node:path";
import subprocess from "node:child_process";
import { getTemplatePaths } from "./util";

export type UploadConfig = {
  templateDirectory: string;
  api: {
    endpoint: string;
    clientId: string;
    clientSecret: string;
  };
};

export async function upload(config: UploadConfig) {
  const templatePaths = getTemplatePaths(config.templateDirectory);
  const errors = [];
  for (const templatePath of templatePaths) {
    try {
      await uploadTemplate(templatePath, config);
    } catch (e) {
      errors.push(`Upload ${templatePath} failed: ${e}`);
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
  const files = collectTemplateFiles(templatePath);
  console.info(`Uploading ${templatePath}:`);
  const body = new FormData();
  files.forEach((file) => {
    console.info(`  - ${file.name}`);
    body.set(file.name, file);
  });
  const response = await fetch(config.api.endpoint, {
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

function collectTemplateFiles(templatePath: string): File[] {
  return fs
    .readdirSync(templatePath, { recursive: true })
    .map((file) => ({
      name: file.toString(),
      filePath: path.join(templatePath, file.toString()),
    }))
    .filter(
      ({ filePath }) =>
        !fs.statSync(filePath).isDirectory() && !gitIgnored(filePath),
    )
    .map(({ name, filePath }) => new File([fs.readFileSync(filePath)], name));
}

function gitIgnored(filePath: string): boolean {
  try {
    subprocess.execSync(`git check-ignore ${filePath}`);
    return true;
  } catch {
    return false;
  }
}

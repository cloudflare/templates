import fs from "node:fs";
import path from "node:path";
import subprocess from "node:child_process";
import { getTemplatePaths } from "./util";

export type UploadConfig = {
  templateDirectory: string;
  apiBaseUrl: string;
};

export async function upload(config: UploadConfig) {
  const templatePaths = getTemplatePaths(config.templateDirectory);
  const results = await Promise.allSettled(
    templatePaths.map((templatePath) => uploadTemplate(templatePath, config)),
  );
  if (results.some((result) => result.status === "rejected")) {
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(`Upload ${templatePaths[i]} failed: ${result.reason}`);
      }
    });
    process.exit(1);
  }
}

async function uploadTemplate(templatePath: string, config: UploadConfig) {
  const files = collectTemplateFiles(templatePath);
  console.info(`Uploading ${templatePath}:`);
  const body = new FormData();
  files.forEach((file) => {
    console.info(`  ${file.name}`);
    body.set(file.name, file);
  });
  const url = `${config.apiBaseUrl}/upload/path`;
  const response = await fetch(url, { method: "POST", body });
  if (!response.ok) {
    throw new Error(
      `Error response from ${url} (${response.status}): ${await response.text()}`,
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

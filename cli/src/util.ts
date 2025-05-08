import { parse, stringify } from "comment-json";
import fs from "node:fs";
import path from "node:path";
import toml from "toml";
import subprocess from "node:child_process";
import MarkdownError from "./MarkdownError";

const TEMPLATE_DIRECTORY_SUFFIX = "-template";

type PackageJson = {
  cloudflare?: {
    dash?: boolean;
  };
};

export type Template = { name: string; path: string };

export type SeedRepo = {
  provider: "github" | "gitlab";
  owner: string;
  repository: string;
  branch?: string;
  path?: string;
};

export const SEED_REPO_FILES = [
  "wrangler.jsonc",
  "wrangler.json",
  "wrangler.toml",
  "package.json",
  "README.md",
];

export function getTemplates(templateDirectory: string): Template[] {
  if (path.basename(templateDirectory).endsWith(TEMPLATE_DIRECTORY_SUFFIX)) {
    // If the specified path is a template directory, just return that.
    const templatePath = templateDirectory;
    const packageJsonPath = path.join(templatePath, "package.json");

    if (!isDashTemplate(packageJsonPath)) {
      return [];
    }

    return [
      {
        name: path.basename(templatePath),
        path: templatePath,
      },
    ];
  }

  // Otherwise, we expect the specified path to be a directory containing many
  // templates (e.g. the repository root).
  return fs
    .readdirSync(templateDirectory)
    .filter(
      (file) =>
        file.endsWith(TEMPLATE_DIRECTORY_SUFFIX) &&
        fs.statSync(path.join(templateDirectory, file)).isDirectory(),
    )
    .filter((name) => {
      const packageJsonPath = path.join(
        templateDirectory,
        name,
        "package.json",
      );
      return isDashTemplate(packageJsonPath);
    })
    .map((name) => ({
      name,
      path: path.join(templateDirectory, name),
    }));
}

export function collectTemplateFiles(
  templatePath: string,
  onlySeedRepoFiles?: boolean,
): File[] {
  return fs
    .readdirSync(templatePath, { recursive: true })
    .map((file) => ({
      name: file.toString(),
      filePath: path.join(templatePath, file.toString()),
    }))
    .filter(({ name }) =>
      onlySeedRepoFiles ? SEED_REPO_FILES.includes(name) : true,
    )
    .filter(
      ({ filePath }) =>
        !filePath.includes("node_modules") &&
        !fs.statSync(filePath).isDirectory() &&
        !gitIgnored(filePath),
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

function isDashTemplate(packageJsonPath: string): boolean {
  try {
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }
    const pkg = readJson(packageJsonPath) as PackageJson;
    return pkg.cloudflare?.dash === true;
  } catch {
    return false;
  }
}

export function readToml(filePath: string): unknown {
  return toml.parse(fs.readFileSync(filePath, { encoding: "utf-8" }));
}

export function readJsonC(filePath: string): unknown {
  return parse(fs.readFileSync(filePath, { encoding: "utf-8" }));
}

export function writeJsonC(filePath: string, object: unknown) {
  fs.writeFileSync(filePath, stringify(object, undefined, 2) + "\n");
}

export function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, { encoding: "utf-8" }));
}

export function writeJson(filePath: string, object: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(object, undefined, 2) + "\n");
}

export async function actionWithSummary(
  title: string,
  action: () => Promise<string | void> | string | void,
) {
  console.log(process.env);
  try {
    const markdown = await action();
    if (
      typeof markdown === "string" &&
      process.env.GITHUB_STEP_SUMMARY !== undefined
    ) {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [`## ${title}`, markdown].join("\n"),
      );
    }
  } catch (err) {
    console.error(err);
    if (
      err instanceof MarkdownError &&
      process.env.GITHUB_STEP_SUMMARY !== undefined
    ) {
      console.error(err.markdown);
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [`## ${title}`, err.markdown].join("\n"),
      );
    }
    throw err;
  }
}

export async function handleCloudflareResponse(response: Response) {
  const text = await response.text();
  if (!response.ok) {
    const json: any = JSON.parse(text);
    if (Array.isArray(json.errors) && json.errors[0]?.message) {
      throw new Error(
        `Error response from ${response.url}: ${json.errors[0]?.message}`,
      );
    }
    throw new Error(
      `Error response from ${response.url} (${response.status}): ${text}`,
    );
  }
  return JSON.parse(text);
}

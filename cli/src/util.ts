import { parse } from "jsonc-parser";
import fs from "node:fs";
import path from "node:path";
import toml from "toml";

const TEMPLATE_DIRECTORY_SUFFIX = "-template";

type PackageJson = {
  cloudflare?: {
    dash?: boolean;
  };
};

export type Template = { name: string; path: string };

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

export function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, { encoding: "utf-8" }));
}

export function writeJson(filePath: string, object: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(object, undefined, 2) + "\n");
}

import fs from "node:fs";
import path from "node:path";
import toml from "toml";

const TEMPLATE_DIRECTORY_SUFFIX = "-template";

export type Template = { name: string; path: string };

export function getTemplates(templateDirectory: string): Template[] {
  if (path.basename(templateDirectory).endsWith(TEMPLATE_DIRECTORY_SUFFIX)) {
    // If the specified path is a template directory, just return that.
    return [
      {
        name: path.basename(templateDirectory),
        path: templateDirectory,
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
        fs.statSync(file).isDirectory(),
    )
    .map((name) => ({
      name,
      path: path.join(templateDirectory, name),
    }));
}

export function readToml(filePath: string): unknown {
  return toml.parse(fs.readFileSync(filePath, { encoding: "utf-8" }));
}

export function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, { encoding: "utf-8" }));
}

export function writeJson(filePath: string, object: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(object, undefined, 2) + "\n");
}

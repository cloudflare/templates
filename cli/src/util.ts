import fs from "node:fs";
import path from "node:path";

const TEMPLATE_DIRECTORY_SUFFIX = "-template";

export function getTemplatePaths(templateDirectory: string): string[] {
  return fs
    .readdirSync(templateDirectory)
    .filter(
      (file) =>
        file.endsWith(TEMPLATE_DIRECTORY_SUFFIX) &&
        fs.statSync(file).isDirectory(),
    )
    .map((template) => path.join(templateDirectory, template));
}

export function readJSON(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, { encoding: "utf-8" }));
}

export function writeJSON(filePath: string, object: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(object, undefined, 2) + "\n");
}

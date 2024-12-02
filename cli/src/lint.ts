import fs from "node:fs";
import path from "node:path";
import { getTemplates, readJson, readToml, Template, writeJson } from "./util";

export type LintConfig = {
  templateDirectory: string;
  fix: boolean;
};

export function lint(config: LintConfig) {
  const templates = getTemplates(config.templateDirectory);
  const results = templates.flatMap((template) =>
    lintTemplate(template, config.fix),
  );
  if (results.length > 0) {
    results.forEach(({ filePath, problems }) => {
      console.error(`Problems with ${filePath}`);
      problems.forEach((problem) => {
        console.log(`  - ${problem}`);
      });
    });
    process.exit(1);
  }
}
const CHECKS = {
  "wrangler.toml": [lintWranglerToml],
  "wrangler.json": [lintWranglerJson],
};
const TARGET_COMPATIBILITY_DATE = "2024-11-01";

type FileDiagnostic = {
  filePath: string;
  problems: string[];
};

function lintTemplate(template: Template, fix: boolean): FileDiagnostic[] {
  return Object.entries(CHECKS).flatMap(([file, linters]) => {
    const filePath = path.join(template.path, file);
    const problems = linters.flatMap((linter) =>
      linter(template, filePath, fix),
    );
    return problems.length > 0 ? [{ filePath, problems }] : [];
  });
}
function lintWranglerToml(
  template: Template,
  filePath: string,
  fix: boolean,
): string[] {
  if (!fs.existsSync(filePath)) {
    // wrangler.toml shouldn't exist, since we use wrangler.json instead.
    return [];
  }
  const jsonPath = filePath.replace(/\.toml$/, ".json");
  if (fix && !fs.existsSync(jsonPath)) {
    // Convert wrangler.toml to wrangler.json if wrangler.json does not already
    // exist.
    writeJson(jsonPath, readToml(filePath));
    fs.unlinkSync(filePath);
    return [];
  }
  return [`Found ${filePath}. Use wrangler.json instead of wrangler.toml!`];
}

function lintWranglerJson(
  template: Template,
  filePath: string,
  fix: boolean,
): string[] {
  if (!fs.existsSync(filePath)) {
    return [
      `Expected ${filePath} to exist. Use wrangler.json instead of wrangler.toml!`,
    ];
  }
  const wrangler = readJson(filePath) as {
    compatibility_date?: string;
    observability?: { enabled?: boolean };
    upload_source_maps?: boolean;
    name?: string;
  };
  if (fix) {
    wrangler.compatibility_date = TARGET_COMPATIBILITY_DATE;
    wrangler.observability = { enabled: true };
    wrangler.upload_source_maps = true;
    wrangler.name = template.name;
    writeJson(filePath, wrangler);
    return [];
  }
  const problems = [];
  if (wrangler.compatibility_date !== TARGET_COMPATIBILITY_DATE) {
    problems.push(
      `"compatibility_date" should be set to "${TARGET_COMPATIBILITY_DATE}"`,
    );
  }
  if (wrangler.observability?.enabled !== true) {
    problems.push(`"observability" should be set to { "enabled": true }`);
  }
  if (wrangler.upload_source_maps !== true) {
    problems.push(`"upload_source_maps" should be set to true`);
  }
  if (wrangler.name !== template.name) {
    problems.push(`"name" should be set to "${template.name}"`);
  }
  return problems;
}

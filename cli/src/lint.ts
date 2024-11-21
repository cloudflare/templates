import path from "node:path";
import { getTemplatePaths, readJSON, writeJSON } from "./util";

export type LintConfig = {
  templateDirectory: string;
  fix: boolean;
};

export function lint(config: LintConfig) {
  const templatePaths = getTemplatePaths(config.templateDirectory);
  const results = templatePaths.flatMap((templatePath) =>
    lintTemplate(templatePath, config.fix),
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
  "wrangler.json": [lintWrangler],
};
const TARGET_COMPATIBILITY_DATE = "2024-11-01";

type FileDiagnostic = {
  filePath: string;
  problems: string[];
};

function lintTemplate(templatePath: string, fix: boolean): FileDiagnostic[] {
  return Object.entries(CHECKS).flatMap(([file, linters]) => {
    const filePath = path.join(templatePath, file);
    const problems = linters.flatMap((linter) => linter(filePath, fix));
    return problems.length > 0 ? [{ filePath, problems }] : [];
  });
}

function lintWrangler(filePath: string, fix: boolean): string[] {
  const wrangler = readJSON(filePath) as {
    compatibility_date?: string;
    observability?: { enabled: boolean };
    upload_source_maps?: boolean;
  };
  if (fix) {
    wrangler.compatibility_date = TARGET_COMPATIBILITY_DATE;
    wrangler.observability = { enabled: true };
    wrangler.upload_source_maps = true;
    writeJSON(filePath, wrangler);
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
  return problems;
}

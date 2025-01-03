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
  "README.md": [lintReadme],
};
const TARGET_COMPATIBILITY_DATE = "2024-11-01";
const DASH_CONTENT_START_MARKER = "<!-- dash-content-start -->";
const DASH_CONTENT_END_MARKER = "<!-- dash-content-end -->";

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
  return [
    `Found ${filePath}. Use --fix to convert wrangler.toml to wrangler.json.`,
  ];
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

function lintReadme(
  template: Template,
  filePath: string,
  fix: boolean,
): string[] {
  if (!fs.existsSync(filePath)) {
    if (fix) {
      fs.writeFileSync(filePath, generatePlaceholderReadme(template));
      return [];
    }
    return [
      `Expected ${filePath} to exist. Use --fix to create a placeholder.`,
    ];
  }
  const lines = fs
    .readFileSync(filePath, { encoding: "utf-8" })
    .split("\n")
    .map((line) => line.trim());
  let next: "content-start" | "content-end" | "document-end" = "content-start";
  for (const [i, line] of lines.entries()) {
    if (line === DASH_CONTENT_START_MARKER) {
      if (next === "content-start") {
        next = "content-end";
      } else {
        return [
          `Unexpected occurrence of ${DASH_CONTENT_START_MARKER} on line ${i + 1}`,
        ];
      }
    } else if (line === DASH_CONTENT_END_MARKER) {
      if (next === "content-end") {
        next = "document-end";
      } else {
        return [
          `Unexpected occurrence of ${DASH_CONTENT_END_MARKER} on line ${i + 1}`,
        ];
      }
    }
  }
  if (next === "content-end") {
    return [`Missing closing ${DASH_CONTENT_END_MARKER}`];
  }
  return [];
}

function generatePlaceholderReadme(template: Template): string {
  const pkg = readJson(path.join(template.path, "package.json")) as {
    description: string;
    cloudflare: { label: string };
  };
  return `# ${pkg.cloudflare.label}

${pkg.description}

## Develop Locally

Use this template with [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the \`create-cloudflare\` CLI):

\`\`\`
npm create cloudflare@latest -- --template=cloudflare/templates/${template.name}
\`\`\`

## Preview Deployment

A live public deployment of this template is available at [https://${template.name}.templates.workers.dev](https://${template.name}.templates.workers.dev)
`;
}

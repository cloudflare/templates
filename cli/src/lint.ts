import fs from "node:fs";
import path from "node:path";
import {
	getAllTemplates,
	readJson,
	readJsonC,
	readToml,
	Template,
	writeJson,
	writeJsonC,
} from "./util";
import MarkdownError from "./MarkdownError";

export type LintConfig = {
	templateDirectory: string;
	fix: boolean;
};

const integrationsPlatCategories = ["starter", "storage", "ai"];

export function lint(config: LintConfig) {
	const templates = getAllTemplates(config.templateDirectory);
	const results = templates.flatMap((template) =>
		lintTemplate(template, config.fix),
	);
	if (results.length > 0) {
		throw new MarkdownError(
			"Linting failed. Run `pnpm -w fix:templates` to fix.",
			results
				.flatMap(({ filePath, problems }) => {
					return [`- ${filePath}`, problems.map((problem) => `  - ${problem}`)];
				})
				.join("\n"),
		);
	}
}
const CHECKS = {
	"wrangler.toml": [lintWranglerToml],
	"wrangler.jsonc": [lintWranglerJsonC],
	"wrangler.json": [lintWranglerJson],
	"README.md": [lintReadme],
	"package.json": [lintPackageJson],
	".gitignore": [lintGitIgnore],
};
const TARGET_COMPATIBILITY_DATE = "2025-10-08";
const DASH_CONTENT_START_MARKER = "<!-- dash-content-start -->";
const DASH_CONTENT_END_MARKER = "<!-- dash-content-end -->";

type FileDiagnostic = {
	filePath: string;
	problems: string[];
};

function lintTemplate(template: Template, fix: boolean): FileDiagnostic[] {
	let allProblems = Object.entries(CHECKS).flatMap(([file, linters]) => {
		const filePath = path.join(template.path, file);
		const problems = linters.flatMap((linter) =>
			linter(template, filePath, fix),
		);
		return problems.length > 0 ? [{ filePath, problems }] : [];
	});

	if (
		!fs.existsSync(path.join(template.path, "wrangler.json")) &&
		!fs.existsSync(path.join(template.path, "wrangler.jsonc"))
	) {
		console.log(`Template ${template.name}`);
		allProblems.push({
			filePath: "General template",
			problems: [
				"Expected wrangler.json or wrangler.jsonc to exist. Use one of those instead of wrangler.toml!",
			],
		});
	}

	return allProblems;
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
	return [`Found ${filePath}. Please convert wrangler.toml to wrangler.json.`];
}

function lintWranglerJsonC(
	template: Template,
	filePath: string,
	fix: boolean,
): string[] {
	if (!fs.existsSync(filePath)) {
		return [];
	}
	const wrangler = readJsonC(filePath) as {
		compatibility_date?: string;
		observability?: { enabled?: boolean };
		upload_source_maps?: boolean;
		name?: string;
	};

	// Read package.json to compare names
	const packageJsonPath = path.join(path.dirname(filePath), "package.json");
	const packageJson = fs.existsSync(packageJsonPath)
		? (readJson(packageJsonPath) as { name?: string })
		: null;

	if (fix) {
		wrangler.compatibility_date = TARGET_COMPATIBILITY_DATE;
		wrangler.observability = { enabled: true };
		wrangler.upload_source_maps = true;
		wrangler.name = template.name;
		writeJsonC(filePath, wrangler);
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

	// Check for name matching between wrangler.json and package.json
	if (wrangler.name !== packageJson?.name) {
		console.log(`Wrangler name is ${wrangler.name}`);
		console.log(`Packagejsonc name is ${packageJson?.name}`);
		problems.push(
			`"name" in wrangler.json (${wrangler.name}) should match package.json name (${packageJson?.name})`,
		);
	}
	return problems;
}

function lintWranglerJson(
	template: Template,
	filePath: string,
	fix: boolean,
): string[] {
	if (!fs.existsSync(filePath)) {
		return [];
	}
	const wrangler = readJson(filePath) as {
		compatibility_date?: string;
		observability?: { enabled?: boolean };
		upload_source_maps?: boolean;
		name?: string;
	};

	// Read package.json to compare names
	const packageJsonPath = path.join(path.dirname(filePath), "package.json");
	const packageJson = fs.existsSync(packageJsonPath)
		? (readJson(packageJsonPath) as { name?: string })
		: null;

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

	// Check for name matching between wrangler.json and package.json
	if (wrangler.name !== packageJson?.name) {
		problems.push(
			`"name" in wrangler.json (${wrangler.name}) should match package.json name (${packageJson?.name})`,
		);
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

function lintPackageJson(
	template: Template,
	filePath: string,
	fix: boolean,
): string[] {
	if (!fs.existsSync(filePath)) {
		return [`Expected ${filePath} to exist.`];
	}

	const pkg = readJson(filePath) as {
		scripts?: { deploy?: string; dev?: string };
		cloudflare?: {
			label?: string;
			products?: string[];
			categories?: string[];
			icon_urls?: string[];
			preview_image_url?: string;
			preview_icon_url?: string;
			publish?: boolean;
		};
	};

	const problems: string[] = [];

	// Check deploy script
	if (!pkg.scripts?.deploy) {
		problems.push('"scripts.deploy" must be defined');
	}
	if (!pkg.scripts?.dev) {
		problems.push('"scripts.dev" must be defined');
	}

	// Check cloudflare object and its required fields
	if (!pkg.cloudflare) {
		problems.push('"cloudflare" object must be defined');
	} else {
		if (!pkg.cloudflare.label) {
			problems.push('"cloudflare.label" must be defined');
		}
		if (!Array.isArray(pkg.cloudflare.products)) {
			problems.push('"cloudflare.products" must be an array');
		}
		if (!Array.isArray(pkg.cloudflare.categories)) {
			problems.push('"cloudflare.categories" must be an array');
		} else {
			pkg.cloudflare.categories.forEach((cat) => {
				!["starter", "storage", "ai"].includes(cat) &&
					problems.push(
						`"cloudflare.categories" lists "${cat}", but can only include "starter", "storage", and "ai".`,
					);
			});
		}
		// Only require preview URLs for published templates
		if (pkg.cloudflare.publish === true) {
			// Ensure a preview image URL is set
			if (!pkg.cloudflare.preview_image_url) {
				problems.push('"cloudflare.preview_image_url" must be defined');
			}
			// Ensure preview_icon_url is set
			if (!pkg.cloudflare.preview_icon_url) {
				problems.push('"cloudflare.preview_icon_url" must be defined');
			}
		}
	}

	return problems;
}

function lintGitIgnore(
	template: Template,
	filePath: string,
	fix: boolean,
): string[] {
	if (!fs.existsSync(filePath)) {
		return [`Expected ${filePath} to exist.`];
	}

	const contents = fs.readFileSync(filePath, { encoding: "utf-8" });
	const EXPECTED_LINES = [/^(\/)?node_modules/gm, /^(\/)?\.wrangler/gm];

	const problems: string[] = [];

	for (const expectedLine of EXPECTED_LINES) {
		if (!contents.match(expectedLine)) {
			problems.push(`Expected ${expectedLine} to exist in ${filePath}`);
		}
	}

	return problems;
}

import "zx/globals";
import { parse, stringify } from "comment-json";
import fs from "node:fs";
import path from "node:path";
import toml from "toml";
import subprocess from "node:child_process";
import MarkdownError from "./MarkdownError";

export const TEMPLATE_DIRECTORY_SUFFIX = "-template";

type PackageJson = {
	cloudflare?: {
		publish?: boolean;
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

// these are all the non-template directories we expect to find
export const ALLOWED_DIRECTORIES = [
	"cli",
	"node_modules",
	"playwright-tests",
	"playwright-report",
	"test-results",
];

export function getAllTemplates(templateDirectory: string): Template[] {
	if (path.basename(templateDirectory).endsWith(TEMPLATE_DIRECTORY_SUFFIX)) {
		// If the specified path is a template directory, just return that.
		const templatePath = templateDirectory;
		const packageJsonPath = path.join(templatePath, "package.json");

		if (!fs.existsSync(packageJsonPath)) {
			return [];
		}

		return [
			{
				name: path.basename(templatePath),
				path: templatePath,
			},
		];
	}

	const directories = fs
		.readdirSync(templateDirectory)
		.filter((file) =>
			fs.statSync(path.join(templateDirectory, file)).isDirectory(),
		);

	for (const name of directories) {
		if (
			!name.endsWith(TEMPLATE_DIRECTORY_SUFFIX) &&
			!name.startsWith(".") &&
			!ALLOWED_DIRECTORIES.includes(name)
		) {
			throw new Error(`"${name}" does not end with "-template".`);
		}
	}

	// Otherwise, we expect the specified path to be a directory containing many
	// templates (e.g. the repository root).
	return directories
		.filter((name) =>
			fs.statSync(path.join(templateDirectory, name)).isDirectory(),
		)
		.filter((name) => name.endsWith(TEMPLATE_DIRECTORY_SUFFIX))
		.filter((name) => {
			const packageJsonPath = path.join(
				templateDirectory,
				name,
				"package.json",
			);
			return fs.existsSync(packageJsonPath);
		})
		.map((name) => ({
			name,
			path: path.join(templateDirectory, name),
		}));
}

export function getPublishedTemplates(templateDirectory: string): Template[] {
	return getAllTemplates(templateDirectory).filter((template) => {
		const packageJsonPath = path.join(template.path, "package.json");
		return isDashTemplate(packageJsonPath);
	});
}

// Deprecated: Use getAllTemplates() or getPublishedTemplates() instead
export function getTemplates(templateDirectory: string): Template[] {
	return getPublishedTemplates(templateDirectory);
}

export function collectTemplateFiles(
	templatePath: string,
	onlySeedRepoFiles?: boolean,
): Array<{ filePath: string; file: File }> {
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
		.map(({ name, filePath }) => ({
			filePath,
			file: new File([fs.readFileSync(filePath)], name),
		}));
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
		return pkg.cloudflare?.publish === true;
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
	try {
		const markdown = await action();
		if (typeof markdown === "string") {
			echo(chalk.green(markdown));
			if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
				fs.appendFileSync(
					process.env.GITHUB_STEP_SUMMARY,
					[`## ${title}`, markdown].join("\n"),
				);
			}
		}
	} catch (err) {
		echo(chalk.red((err as Error).message));
		if (err instanceof MarkdownError) {
			echo(chalk.yellow(err.markdown));
			if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
				fs.appendFileSync(
					process.env.GITHUB_STEP_SUMMARY,
					[`## ${title}`, err.markdown].join("\n"),
				);
			}
			process.exit(1);
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
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export type CommentOnPRConfig = {
	prId: string;
	githubToken: string;
	body: string;
	noDuplicates?: boolean;
};

export async function commentOnPR({
	prId,
	githubToken,
	body,
	noDuplicates,
}: CommentOnPRConfig) {
	const isDuplicate = await isDuplicateComment({
		prId,
		githubToken,
		body,
	});
	if (isDuplicate && noDuplicates) {
		return body;
	}
	const response = await fetchWithRetries(
		`https://api.github.com/repos/cloudflare/templates/issues/${prId}/comments`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${githubToken}`,
				Connection: "close",
			},
			body: JSON.stringify({
				body,
			}),
		},
	);
	if (!response.ok) {
		throw new Error(
			`Error response from GitHub (${response.status}): ${await response.text()}`,
		);
	}
	return body;
}

export async function isDuplicateComment({
	prId,
	githubToken,
	body,
}: CommentOnPRConfig) {
	const response = await fetchWithRetries(
		`https://api.github.com/repos/cloudflare/templates/issues/${prId}/comments`,
		{
			headers: {
				Authorization: `Bearer ${githubToken}`,
				Connection: "close",
			},
		},
	);
	if (!response.ok) {
		throw new Error(
			`Error response from GitHub (${response.status}): ${await response.text()}`,
		);
	}
	const comments = (await response.json()) as Array<{ body: string }>;
	return comments.find((comment) => comment.body === body);
}

export type PRState = "open" | "closed" | "all";

export type PR = {
	url: string;
	html_url: string;
	id: number;
	state: PRState;
};

export type CreatePRConfig = {
	githubToken: string;
	head: string;
	base: string;
	title: string;
	body: string;
	draft?: boolean;
};

export async function createPR({
	githubToken,
	...params
}: CreatePRConfig): Promise<PR> {
	const response = await fetchWithRetries(
		`https://api.github.com/repos/cloudflare/templates/pulls`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${githubToken}`,
				Connection: "close",
			},
			body: JSON.stringify(params),
		},
	);
	if (!response.ok) {
		throw new Error(
			`Error response from GitHub (${response.status}): ${await response.text()}`,
		);
	}
	return (await response.json()) as PR;
}

export type GetPRByBranchConfig = {
	githubToken: string;
	head: string;
	base: string;
	state: PRState;
};

export async function getPRByBranch({
	githubToken,
	head,
	base,
	state,
}: GetPRByBranchConfig): Promise<PR | null> {
	const url = new URL(
		`https://api.github.com/repos/cloudflare/templates/pulls`,
	);
	url.searchParams.set("head", `cloudflare:${head}`);
	url.searchParams.set("base", base);
	url.searchParams.set("state", state);
	const response = await fetchWithRetries(url, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${githubToken}`,
			Connection: "close",
		},
	});
	if (!response.ok) {
		throw new Error(
			`Error response from GitHub (${response.status}): ${await response.text()}`,
		);
	}
	const [pr] = (await response.json()) as PR[];
	return pr ?? null;
}

export async function getLatestPackageVersion(packageName: string) {
	const response = await fetchWithRetries(
		`https://registry.npmjs.org/${packageName}/latest`,
	);
	if (!response.ok) {
		throw new Error(
			`Error response from ${response.url} (${response.status}): ${await response.text()}`,
		);
	}
	const { version } = (await response.json()) as { version: string };
	return version;
}

export function convertToMarkdownTable(arr: Array<Record<string, unknown>>) {
	if (!arr || arr.length === 0) {
		return "";
	}

	const headers = Object.keys(arr[0]);
	const headerRow = `| ${headers.join(" | ")} |`;
	const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;

	const dataRows = arr.map((obj) => {
		const row = headers.map((header) => obj[header]);
		return `| ${row.join(" | ")} |`;
	});

	return [headerRow, separatorRow, ...dataRows].join("\n");
}

export function convertToSafeBranchName(str: string) {
	return str
		.toLowerCase() // Convert to lowercase
		.replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric characters with hyphens
		.replace(/^-+|-+$/g, "") // Remove leading or trailing hyphens
		.substring(0, 100); // Limit length
}

export const fetchWithRetries: typeof fetch = async (...args) => {
	const maxRetries = 3;
	for (let numRetries = 0; numRetries < maxRetries; numRetries++) {
		try {
			return fetch(...args);
		} catch (err) {
			if (numRetries === maxRetries - 1) {
				throw err;
			}
			await new Promise((resolve) => setTimeout(resolve, numRetries * 5_000));
		}
	}
	throw new Error("Max retries reached."); // this should be unreachable
};

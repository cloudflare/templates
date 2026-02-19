import {
	commentOnPR,
	convertToMarkdownTable,
	fetchWithRetries,
	TEMPLATE_DIRECTORY_SUFFIX,
} from "./util";

export type DepsInfoConfig = {
	prId: string;
	githubToken: string;
};

type GithubFileStatus =
	| "added"
	| "removed"
	| "modified"
	| "renamed"
	| "copied"
	| "changed"
	| "unchanged";

type DepsInfo = {
	template: string;
	name: string;
	version: string;
	latestVersion: string;
	isDevDependency: boolean;
};

/**
 * Pull all the changed files from a PR,
 * and if the package.json has changed for a template,
 * record the dependency info found there.
 */
export async function depsInfo({ prId, githubToken }: DepsInfoConfig) {
	const deps: DepsInfo[] = [];
	const files = await getFiles(prId, githubToken);
	for (const file of files) {
		const [template] = file.filename.split("/");
		if (!template.endsWith(TEMPLATE_DIRECTORY_SUFFIX)) {
			continue;
		}
		if (!file.filename.endsWith("/package.json")) {
			continue;
		}
		const packageJSON = await getPackageJSON(file.raw_url);
		if (["added", "modified", "changed"].includes(file.status)) {
			deps.push(
				...(await makeDepsInfo(
					template,
					packageJSON.dependencies ?? {},
					false,
				)),
				...(await makeDepsInfo(
					template,
					packageJSON.devDependencies ?? {},
					true,
				)),
			);
		}
	}
	if (deps.length) {
		deps.sort((a, b) => {
			if (a.template < b.template) return 1;
			if (a.template > b.template) return -1;
			return 0;
		});
		await commentOnPR({
			prId,
			githubToken,
			body: convertToMarkdownTable(deps),
			noDuplicates: true,
		});
	}
}

async function getFiles(prId: string, githubToken: string) {
	const response = await fetchWithRetries(
		`https://api.github.com/repos/cloudflare/templates/pulls/${prId}/files`,
		{
			headers: {
				Authorization: `Bearer ${githubToken}`,
			},
		},
	);
	return (await response.json()) as Array<{
		filename: string;
		status: GithubFileStatus;
		raw_url: string;
	}>;
}

async function getPackageJSON(url: string) {
	const response = await fetchWithRetries(url);
	if (!response.ok) {
		throw new Error(
			`Error response from ${response.url} (${response.status}): ${await response.text()}`,
		);
	}
	return (await response.json()) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
}

async function getLatestPackageVersion(packageName: string) {
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

async function makeDepsInfo(
	template: string,
	dependencies: Record<string, string>,
	isDevDependency: boolean,
) {
	const deps: DepsInfo[] = [];
	for (const [name, version] of Object.entries(dependencies)) {
		const latestVersion = await getLatestPackageVersion(name);
		if (version !== latestVersion) {
			deps.push({
				template,
				name,
				version,
				latestVersion,
				isDevDependency,
			});
		}
	}
	return deps;
}

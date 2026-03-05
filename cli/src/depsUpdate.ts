import "zx/globals";
import subprocess from "node:child_process";
import path from "node:path";
import {
	convertToMarkdownTable,
	convertToSafeBranchName,
	createPR,
	getLatestPackageVersion,
	getPRByBranch,
} from "./util";

export type DepsUpdateConfig = {
	githubToken: string;
	githubActor: string;
};

type DepUpdateInfo = {
	packages: Record<string, string>;
	latestVersion: string;
};

export async function depsUpdate({
	githubToken,
	githubActor,
}: DepsUpdateConfig) {
	const packages = getPackages();
	const firstPartyUpdates = new Map<string, DepUpdateInfo>();
	const thirdPartyMajorUpdates = new Map<string, DepUpdateInfo>();

	for (const pkg of packages) {
		for (const dependencies of [
			pkg.dependencies || {},
			pkg.devDependencies || {},
		]) {
			for (const [depName, info] of Object.entries(dependencies)) {
				if (!info.resolved) {
					// it's a local dependency, like the CLI -- not an NPM package
					continue;
				}
				const latestVersion = await getLatestPackageVersion(depName);
				if (latestVersion !== info.version) {
					const is1stParty =
						depName.startsWith("@cloudflare/") || depName === "wrangler";

					if (is1stParty) {
						const update = firstPartyUpdates.get(depName) ?? {
							packages: {},
							latestVersion,
						};
						Object.assign(update.packages, {
							[pkg.name]: info.version,
						});
						firstPartyUpdates.set(depName, update);
					} else {
						const [currentMajorVersion] = info.version.split(".");
						const [latestMajorVersion] = latestVersion.split(".");
						if (Number(currentMajorVersion) < Number(latestMajorVersion)) {
							const update = thirdPartyMajorUpdates.get(depName) ?? {
								packages: {},
								latestVersion,
							};
							Object.assign(update.packages, {
								[pkg.name]: info.version,
							});
							thirdPartyMajorUpdates.set(depName, update);
						}
					}
				}
			}
		}
	}

	subprocess.execSync(`git config --global user.name "${githubActor}"`);
	subprocess.execSync(
		`git config --global user.email "${githubActor}@users.noreply.github.com"`,
	);

	const updateConfigs: PerformUpdatesConfig[] = [
		{
			depNames: Array.from(firstPartyUpdates.keys()),
			updates: firstPartyUpdates,
			githubToken,
			title: "syncpack update first party dependencies",
			branch: "syncpack/1st-party-updates",
		},
		...Array.from(thirdPartyMajorUpdates.keys()).map((depName) => ({
			depNames: [depName],
			updates: thirdPartyMajorUpdates,
			githubToken,
			title: `syncpack update ${depName} to ${thirdPartyMajorUpdates.get(depName)?.latestVersion}`,
			branch: `syncpack/${convertToSafeBranchName(depName)}`,
		})),
	];

	let markdown: string[] = [];
	for (const updateConfig of updateConfigs) {
		const { depsToPRs, failedUpdates } = await performUpdates(updateConfig);

		const arr = Array.from(updateConfig.updates).map(
			([depName, { packages, latestVersion }]) => ({
				dependency: depName,
				version: latestVersion,
				succeeded: failedUpdates.has(depName) ? ":x:" : ":white_check_mark:",
				affected: `<ul>${Object.entries(packages)
					.map(
						([packageName, version]) => `<li>${packageName}: ${version}</li>`,
					)
					.join("")}</ul>`,
				PR: depsToPRs.get(depName),
			}),
		);
		arr.sort((a, b) => {
			if (a.dependency < b.dependency) return -1;
			if (a.dependency > b.dependency) return 1;
			return 0;
		});
		markdown.push(updateConfig.title, convertToMarkdownTable(arr));
	}
	return markdown.join("\n");
}

type PerformUpdatesConfig = {
	depNames: string[];
	updates: Map<string, DepUpdateInfo>;
	githubToken: string;
	title: string;
	branch: string;
};

async function performUpdates({
	depNames,
	updates,
	githubToken,
	title,
	branch,
}: PerformUpdatesConfig) {
	const depsToPRs = new Map();
	const failedUpdates = new Set<string>();
	const cwd = process.cwd();
	const branchesDir = path.join(cwd, "_branches");
	const head = branch;
	const base = "main";

	try {
		echo(chalk.green(`checking if PR exists for ${head}`));
		const existingPR = await getPRByBranch({
			githubToken,
			head,
			base,
			state: "open",
		});

		const body = [
			`Update ${depNames} in the following packages:`,
			...depNames.flatMap((depName) => {
				const { packages } = updates.get(depName)!;
				return Object.entries(packages).map(
					([packageName, version]) => `- ${packageName}: ${depName}@${version}`,
				);
			}),
		].join("\n");

		echo(chalk.green(`creating ${branchesDir} as a working tree for ${head}`));
		subprocess.execSync(`
      mkdir ${branchesDir}
      git worktree add ${branchesDir} main -b ${head} --force
      `);

		echo(chalk.green(`updating ${depNames}`));
		const updateCommand = depNames.reduce((command, depName) => {
			// only update the packages we specified
			const sources = Object.keys(updates.get(depName)!.packages)
				.map((packageName) => `--source '${packageName}/package.json'`)
				.join(" ");
			return `${command} --dependencies '${depName}' ${sources}`;
		}, "pnpm dlx syncpack@alpha update");
		subprocess.execSync(updateCommand, {
			cwd: branchesDir,
		});

		echo(chalk.green(`checking for any changes to commit`));
		const diff = subprocess.execSync("git diff --name-only", {
			encoding: "utf-8",
			cwd: branchesDir,
		});

		if (!diff) {
			return { depsToPRs, failedUpdates };
		}

		echo(chalk.green("reinstall dependencies"));
		subprocess.execSync(
			"pnpm install --no-frozen-lockfile --child-concurrency=10 --ignore-scripts",
			{
				cwd: branchesDir,
			},
		);

		echo(chalk.green("lint templates"));
		subprocess.execSync(`templates lint ${branchesDir} --fix`);

		echo(chalk.green("generate lockfiles"));
		subprocess.execSync(`templates generate-npm-lockfiles ${branchesDir}`);

		echo(chalk.green("regenerate types"));
		subprocess.execSync("pnpm run  --recursive cf-typegen", {
			cwd: branchesDir,
		});

		echo(chalk.green("run prettier"));
		subprocess.execSync(`prettier ${branchesDir} --write`);

		echo(chalk.yellow(`Creating pull request ${head} => ${base}`));
		subprocess.execSync(
			`
        git add .
        git commit -m '${title}'
        `,
			{
				cwd: branchesDir,
			},
		);
		if (process.env.CI) {
			subprocess.execSync(`git push --force --set-upstream origin ${head}`, {
				cwd: branchesDir,
			});
			const pr =
				existingPR ??
				(await createPR({
					githubToken,
					head,
					base,
					title,
					body,
				}));
			for (const depName of depNames) {
				depsToPRs.set(depName, `[#${pr.id}](${pr.html_url})`);
			}
		}
	} catch (err) {
		console.error(err);
		for (const depName of depNames) {
			failedUpdates.add(depName);
		}
	} finally {
		try {
			echo(chalk.green(`cleaning up ${branchesDir}`));
			subprocess.execSync(`git worktree remove ${branchesDir} --force`);
			subprocess.execSync(`rm -rf ${branchesDir}`);
		} catch {}
	}
	return { depsToPRs, failedUpdates };
}

type PNPMPackageDependency = {
	from: string;
	version: string;
	path: string;
	resolved?: string;
};

type PNPMPackageInfo = {
	name: string;
	path: string;
	private: boolean;
	dependencies?: Record<string, PNPMPackageDependency>;
	devDependencies?: Record<string, PNPMPackageDependency>;
};

function getPackages() {
	const result = subprocess.execSync("pnpm list --recursive --json", {
		encoding: "utf-8",
	});
	return JSON.parse(result) as PNPMPackageInfo[];
}

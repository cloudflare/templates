import "zx/globals";
import subprocess from "node:child_process";
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

export async function depsUpdate({
  githubToken,
  githubActor,
}: DepsUpdateConfig) {
  const packages = getPackages();
  const toUpdate = new Map<
    string,
    { packages: Record<string, string>; latestVersion: string }
  >();
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
        const existingUpdate = toUpdate.get(depName);
        if (existingUpdate && existingUpdate.latestVersion !== info.version) {
          Object.assign(existingUpdate.packages, {
            [pkg.name]: info.version,
          });
          continue;
        }
        const latestVersion = await getLatestPackageVersion(depName);
        if (latestVersion !== info.version) {
          toUpdate.set(depName, {
            packages: {
              [pkg.name]: info.version,
            },
            latestVersion,
          });
        }
      }
    }
  }

  subprocess.execSync(`git config --global user.name "${githubActor}"`);
  subprocess.execSync(
    `git config --global user.email "${githubActor}@users.noreply.github.com"`,
  );
  const depsToPRs = new Map();
  const failedUpdates = new Set<string>();
  for (const [depName, { packages, latestVersion }] of toUpdate) {
    const head = `syncpack/${depName}-${convertToSafeBranchName(latestVersion)}`;
    const base = "main";
    const title = `syncpack update ${depName} to ${latestVersion}`;

    try {
      const existingPR = await getPRByBranch({
        githubToken,
        head,
        base,
        state: "all",
      });
      if (existingPR) {
        continue;
      }

      echo(chalk.yellow(title));

      const body = [
        `Update ${depName} in the following packages:`,
        ...Object.entries(packages).map(
          ([packageName, version]) => `- ${packageName}: ${version}`,
        ),
      ].join("\n");
      subprocess.execSync(`
      git checkout -b ${head} ${base}
      npx syncpack@alpha update --dependencies '${depName}'
      pnpm install --no-frozen-lockfile --child-concurrency=10
      pnpm run fix
      `);
      const diff = subprocess.execSync("git diff", { encoding: "utf-8" });
      echo(diff);
      echo(chalk.yellow(`Creating pull request ${head} => ${base}`));
      if (diff) {
        subprocess.execSync(
          `
        git add .
        git commit -m '${title}'
        git push --set-upstream origin ${head}
        git clean -dfX # removes built files
        `,
        );
        const { id, url } = await createPR({
          githubToken,
          head,
          base,
          title,
          body,
        });
        depsToPRs.set(depName, `[#${id}](${url})`);
      }
    } catch (err) {
      console.error(err);
      failedUpdates.add(depName);
    }
  }
  const arr = Array.from(toUpdate).map(
    ([depName, { packages, latestVersion }]) => ({
      dependency: depName,
      version: latestVersion,
      succeeded: failedUpdates.has(depName) ? ":x:" : ":white_check_mark:",
      affected: `<ul>${Object.entries(packages)
        .map(([packageName, version]) => `<li>${packageName}: ${version}</li>`)
        .join("")}</ul>`,
      PR: depsToPRs.get(depName),
    }),
  );
  arr.sort((a, b) => {
    if (a.dependency < b.dependency) return -1;
    if (a.dependency > b.dependency) return 1;
    return 0;
  });
  return convertToMarkdownTable(arr);
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

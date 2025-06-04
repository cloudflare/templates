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
  const cwd = process.cwd();
  const branchesDir = path.join(cwd, "_branches");

  for (const [depName, { packages, latestVersion }] of toUpdate) {
    const head = `syncpack/${depName}-${convertToSafeBranchName(latestVersion)}`;
    const base = "main";
    const title = `syncpack update ${depName} to ${latestVersion}`;

    try {
      echo(chalk.green(`checking if PR exists for ${head}`));
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
      echo(
        chalk.green(`creating ${branchesDir} as a working tree for ${head}`),
      );
      subprocess.execSync(`
      mkdir ${branchesDir}
      git worktree add ${branchesDir} main -b ${head} --force
      `);

      echo(chalk.green(`updating ${depName}`));
      subprocess.execSync(
        `pnpm dlx syncpack@alpha update --dependencies '${depName}'`,
        {
          cwd: branchesDir,
        },
      );

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
      subprocess.execSync("pnpm run cf-typegen --recursive", {
        cwd: branchesDir,
      });

      echo(chalk.green("run prettier"));
      subprocess.execSync(`prettier ${branchesDir} --write`);

      echo(chalk.green(`checking for any changes to commit`));
      const diff = subprocess.execSync("git diff", {
        encoding: "utf-8",
        cwd: branchesDir,
      });

      if (diff) {
        echo(chalk.blue(diff));
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
          subprocess.execSync(`git push --set-upstream origin ${head}`, {
            cwd: branchesDir,
          });
          const { id, url } = await createPR({
            githubToken,
            head,
            base,
            title,
            body,
          });
          depsToPRs.set(depName, `[#${id}](${url})`);
        }
      }
    } catch (err) {
      console.error(err);
      failedUpdates.add(depName);
    }
    try {
      echo(chalk.green(`cleaning up ${branchesDir}`));
      subprocess.execSync(`git worktree remove ${branchesDir} --force`);
      subprocess.execSync(`rm -rf ${branchesDir}`);
    } catch {}
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

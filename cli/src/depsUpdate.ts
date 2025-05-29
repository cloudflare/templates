import "zx/globals";
import subprocess from "node:child_process";
import { convertToMarkdownTable, getLatestPackageVersion } from "./util";

export type DepsUpdateConfig = {
  githubToken: string;
  githubActor: string;
};

export async function depsUpdate({
  githubToken,
  githubActor,
}: DepsUpdateConfig) {
  const packages = getPackages();
  const toUpdate = new Map<string, { packages: string[]; version: string }>();
  const alreadyLatest = new Set();
  for (const pkg of packages) {
    for (const dependencies of [
      pkg.dependencies || {},
      pkg.devDependencies || {},
    ]) {
      for (const [depName, info] of Object.entries(dependencies)) {
        if (toUpdate.has(depName)) {
          toUpdate.get(depName)?.packages.push(pkg.name);
          continue;
        }
        if (alreadyLatest.has(depName)) {
          continue;
        }
        const latestVersion = await getLatestPackageVersion(depName);
        if (latestVersion === info.version) {
          alreadyLatest.add(depName);
        } else {
          toUpdate.set(depName, {
            packages: [pkg.name],
            version: latestVersion,
          });
        }
      }
    }
  }

  // subprocess.execSync(`git config --global user.name "${githubActor}"`);
  // subprocess.execSync(
  //   `git config --global user.email "${githubActor}@users.noreply.github.com"`,
  // );
  const date = new Date().toISOString().slice(0, 10);
  const depsToPRs = new Map();
  for (const [depName, { packages, version }] of toUpdate) {
    const head = `syncpack/${depName}-${date}`;
    const base = "main";
    const title = `syncpack update ${depName} to ${version}`;
    echo(chalk.yellow(title));
    const body = [
      `Update ${depName} in the following packages:`,
      ...packages.map((packageName) => `- ${packageName}`),
    ].join("\n");
    subprocess.execSync(`
      git checkout -b ${head} ${base}
      syncpack update --filter '${depName}'
      if [[ -n "$(git diff --exit-code)" ]]; then
        git add .
        git commit -m '${title}'
        # git push
      fi
      `);
    // const { id, url } = await createPullRequest({
    //   githubToken,
    //   head,
    //   base,
    //   title,
    //   body,
    // });
    // depsToPRs.set(depName, `[#${id}](${url})`);
  }
  const arr = Array.from(toUpdate).map(([depName, { packages, version }]) => ({
    dependency: depName,
    version,
    affected: `<ul>${packages.map((item) => `<li>${item}</li>`).join("")}</ul>`,
    PR: depsToPRs.get(depName),
  }));
  arr.sort((a, b) => {
    if (a.dependency < b.dependency) return 1;
    if (a.dependency > b.dependency) return -1;
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
//# sourceMappingURL=depsUpdate.js.map

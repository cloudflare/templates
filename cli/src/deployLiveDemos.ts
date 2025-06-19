import "zx/globals";
import subprocess from "node:child_process";
import { getTemplates } from "./util";

export type DeployLiveDemosConfig = {
  templateDirectory: string;
};

export default async function deployLiveDemos({
  templateDirectory,
}: DeployLiveDemosConfig) {
  const templates = getTemplates(templateDirectory);
  await Promise.all(
    templates.map(({ path: templatePath }) => {
      subprocess.execSync("npm install", {
        cwd: templatePath,
      });
      subprocess.execSync("npm run build --if-present", {
        cwd: templatePath,
      });
      subprocess.execSync("npm run deploy", {
        cwd: templatePath,
      });
    }),
  );
}

import "zx/globals";
import { z } from "zod";
import { createHash } from "node:crypto";

const repoRoot = path.resolve(__dirname, "../..");

async function getTemplates(): Promise<string[]> {
  return (await glob("./*-template/package.json")).map((t) => path.dirname(t));
}

export async function generateNpmLockfiles(): Promise<void> {
  const config = await new TemplatesConfig().load();
  const templates = await getTemplates();

  for (const name of templates) {
    echo(chalk.blue(`Updating template: ${chalk.grey(name)}`));
    cd(path.resolve(repoRoot, name));

    const packageJsonHash = await hashFile("./package.json");
    const modified = config.updateTemplateHash(name, packageJsonHash);

    if (!modified) {
      echo(chalk.grey("package-lock.json already up to date, skipping"));
      continue;
    }

    await fs.rm("./package-lock.json", { force: true });
    await fs.rm("./node_modules", { force: true, recursive: true });

    await $({
      verbose: true,
      stdio: "inherit",
    })`npm install --no-audit --progress=false`;

    await fs.rm("./node_modules", { force: true, recursive: true });
  }

  await config.save();

  // Restore dependencies with pnpm
  await $`pnpm install --child-concurrency=10`.verbose();
}

export async function lintNpmLockfiles(): Promise<void> {
  const config = await new TemplatesConfig().load();
  const templates = await getTemplates();

  for (const name of templates) {
    cd(path.resolve(repoRoot, name));
    const packageJsonHash = await hashFile("./package.json");
    const modified = config.updateTemplateHash(name, packageJsonHash);

    if (modified) {
      echo(
        chalk.red(
          `npm package lock for ${name} is out of date! Please run \`pnpm generate-npm-lockfiles\``,
        ),
      );
      process.exit(1);
    }
  }
}

class TemplatesConfig {
  private configPath = path.resolve(repoRoot, "./templates.json");
  templates: Config["templates"] = {};

  async load(): Promise<TemplatesConfig> {
    const cfg = await fs
      .readFile(this.configPath)
      .then((c) => Config.parse(JSON.parse(c.toString())))
      .catch(
        () =>
          ({
            templates: {},
          }) satisfies Config,
      );
    this.templates = cfg.templates;
    return this;
  }

  async save(): Promise<void> {
    await fs.writeFile(
      this.configPath,
      JSON.stringify(
        Config.parse({
          templates: this.templates,
        } satisfies Config),
        null,
        2,
      ),
    );
  }

  /**
   * Updates the hash for the given template and returns
   * whether the hash has changed
   */
  updateTemplateHash(template: string, hash: string): boolean {
    let templateConfig = this.templates[template];
    if (templateConfig === undefined) {
      this.templates[template] = {
        package_json_hash: hash,
      };
      return true;
    } else if (templateConfig.package_json_hash === hash) {
      return false;
    } else {
      templateConfig.package_json_hash = hash;
      return true;
    }
  }
}

type TemplateConfig = z.infer<typeof TemplateConfig>;
const TemplateConfig = z.object({
  package_json_hash: z.string(),
});

type Config = z.infer<typeof Config>;
const Config = z.object({
  templates: z.record(z.string(), TemplateConfig),
});

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha1");

  const stream = fs.createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }

  return hash.digest("hex");
}

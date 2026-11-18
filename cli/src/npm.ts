import "zx/globals";
import { z } from "zod";
import { createHash } from "node:crypto";
import path from "node:path";
import MarkdownError from "./MarkdownError";
import { getAllTemplates } from "./util";

export type NpmLockfilesConfig = {
	templateDirectory: string;
};

/**
 * Generates npm lockfiles for all templates in the repository.
 * Updates template hashes and regenerates package-lock.json files when necessary.
 * @throws {Error} If template operations fail
 */
export async function generateNpmLockfiles({
	templateDirectory,
}: NpmLockfilesConfig): Promise<void> {
	const repoRoot = path.resolve(templateDirectory);
	const config = await new TemplatesConfig(repoRoot).load();
	const templates = getAllTemplates(templateDirectory);

	for (const { name } of templates) {
		echo(chalk.blue(`Updating template: ${chalk.grey(name)}`));
		cd(path.resolve(repoRoot, name));

		const packageJsonHash = await hashFile("./package.json");
		const modified = config.updateTemplateHash(name, packageJsonHash);

		if (!modified) {
			echo(chalk.grey("package-lock.json already up to date, skipping"));
			continue;
		}

		await fs.rm("./package-lock.json", { force: true });
		// Rename node_modules to prevent npm from using it's contents in the lockfile
		const hasNodeModules = await fs.pathExists("./node_modules");
		if (hasNodeModules) {
			await fs.move("./node_modules", "./._node_modules");
		}

		await $({
			verbose: true,
			stdio: "inherit",
		})`npm install --no-audit --progress=false --package-lock-only`;

		if (hasNodeModules) {
			// npm may create a new node_modules directory, remove it before restoring the original
			await fs.rm("./node_modules", { recursive: true, force: true });
			await fs.move("./._node_modules", "./node_modules");
		}
	}

	await config.save();
}

/**
 * Validates that all template package-lock.json files are up to date
 * with their respective package.json files.
 * @throws {Error} If any template's lockfile is out of date
 */
export async function lintNpmLockfiles({
	templateDirectory,
}: NpmLockfilesConfig): Promise<void> {
	const repoRoot = path.resolve(templateDirectory);
	const config = await new TemplatesConfig(repoRoot).load();
	const templates = getAllTemplates(templateDirectory);

	const errors: string[] = [];
	for (const { name } of templates) {
		cd(path.resolve(repoRoot, name));
		const packageJsonHash = await hashFile("./package.json");
		const modified = config.updateTemplateHash(name, packageJsonHash);

		if (modified) {
			echo(
				chalk.red(
					`npm package lock for ${name} is out of date! Please run \`pnpm -w fix:lockfiles\`.`,
				),
			);
			errors.push(`- ❌ ${name}`);
		}
	}
	if (errors.length) {
		throw new MarkdownError(
			"Found out-of-date npm lockfiles.",
			[
				"The following templates are out of date:",
				...errors,
				"Please run `pnpm -w fix:lockfiles`.",
			].join("\n"),
		);
	}
}

class TemplatesConfig {
	private configPath: string;
	templates: Config["templates"] = {};

	constructor(repoRoot: string) {
		this.configPath = path.resolve(repoRoot, "./templates.json");
	}

	async load(): Promise<TemplatesConfig> {
		const cfg = await fs
			.readFile(this.configPath)
			.then((c: Buffer<ArrayBufferLike>) =>
				Config.parse(JSON.parse(c.toString())),
			)
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

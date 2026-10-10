import fs from "node:fs";
import path from "node:path";
import MarkdownError from "./MarkdownError";
import { getAllTemplates, readJsonC } from "./util";

type WorkerBuildConfig = {
	main?: string;
	upload_source_maps?: boolean;
	assets?: { directory?: string };
};

/** Check framework output after building. Wrangler generates maps for unbundled starters. */
export function checkSourceMaps(templateDirectory: string): void {
	const problems: string[] = [];
	for (const template of getAllTemplates(templateDirectory)) {
		const isFramework = fs
			.readdirSync(template.path)
			.some((file) => /^(vite|astro)\.config\.[cm]?[jt]s$/.test(file));
		if (!isFramework) continue;
		try {
			checkFrameworkSourceMaps(template.path);
		} catch (error) {
			problems.push(`${template.name}: ${(error as Error).message}`);
		}
	}
	if (problems.length) {
		throw new MarkdownError(
			"Worker source map checks failed",
			problems.map((problem) => `- ${problem}`).join("\n"),
		);
	}
}

export function checkFrameworkSourceMaps(templatePath: string): void {
	const redirectPath = path.join(templatePath, ".wrangler/deploy/config.json");
	const rootConfigPath = ["wrangler.jsonc", "wrangler.json"]
		.map((file) => path.join(templatePath, file))
		.find(fs.existsSync);
	if (!rootConfigPath) throw new Error("Missing Wrangler configuration");
	const configPath = fs.existsSync(redirectPath)
		? path.resolve(
				path.dirname(redirectPath),
				(readJsonC(redirectPath) as { configPath: string }).configPath,
			)
		: rootConfigPath;
	if (!fs.existsSync(configPath))
		throw new Error(
			"Missing generated Wrangler configuration; build the template first",
		);
	const config = readJsonC(configPath) as WorkerBuildConfig;
	if (config.upload_source_maps !== true)
		throw new Error("Built Worker must enable upload_source_maps");
	const astroWorkerDir = path.join(templatePath, "dist/_worker.js");
	const workerDir = fs.existsSync(astroWorkerDir)
		? astroWorkerDir
		: configPath !== rootConfigPath
			? path.dirname(configPath)
			: path.join(templatePath, "build/server");
	if (!fs.existsSync(workerDir))
		throw new Error("Missing Worker build output; build the template first");
	const assetsDir =
		config.assets?.directory &&
		path.resolve(path.dirname(configPath), config.assets.directory);
	let mapCount = 0;
	for (const file of fs.readdirSync(workerDir, { recursive: true })) {
		if (!/\.[cm]?js$/.test(file.toString())) continue;
		const jsPath = path.join(workerDir, file.toString());
		const code = fs.readFileSync(jsPath, "utf8");
		const reference = /\/\/# sourceMappingURL=(\S+)/.exec(code)?.[1];
		if (!reference) continue;
		if (reference.startsWith("data:"))
			throw new Error(`${file} uses inline maps; emit external maps`);
		const mapPath = path.resolve(path.dirname(jsPath), reference);
		if (!fs.existsSync(mapPath))
			throw new Error(`${file} references a missing source map`);
		const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
		if (
			map.version !== 3 ||
			!Array.isArray(map.sources) ||
			typeof map.mappings !== "string"
		)
			throw new Error(`${file} has an invalid source map`);
		if (assetsDir && isInside(assetsDir, mapPath)) {
			const ignorePath = path.join(assetsDir, ".assetsignore");
			const ignored =
				fs.existsSync(ignorePath) &&
				fs
					.readFileSync(ignorePath, "utf8")
					.split(/\r?\n/)
					.some((pattern) => {
						// Worker directories are excluded as a whole, including their maps.
						const directory = pattern
							.trim()
							.replace(/^\//, "")
							.replace(/\/\*\*$/, "");
						return (
							directory &&
							!directory.includes("*") &&
							isInside(path.join(assetsDir, directory), mapPath)
						);
					});
			if (!ignored)
				throw new Error(
					`${file}'s server map is inside public assets; exclude its Worker directory in .assetsignore`,
				);
		}
		// Generated re-export entry files can have empty maps; require mapped source in the chunks.
		if (map.sources.length && map.mappings.length) mapCount++;
	}
	if (!mapCount)
		throw new Error(
			"No external Worker source maps found; enable maps in the server build",
		);
}

function isInside(directory: string, file: string): boolean {
	const relative = path.relative(directory, file);
	return (
		relative !== ".." &&
		!relative.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relative)
	);
}

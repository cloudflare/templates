import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import subprocess from "node:child_process";
import deployLiveDemos from "../src/deployLiveDemos";
import MarkdownError from "../src/MarkdownError";
import { writeJson } from "../src/util";

type Call = { command: string; cwd: string };
type Behavior = (call: Call) => Error | null | Promise<Error | null>;

describe("deployLiveDemos", () => {
	const testDir = path.join(__dirname, "test-live-demos");
	const names = ["a-template", "b-template", "c-template"];

	beforeEach(() => {
		for (const name of names) {
			fs.mkdirSync(path.join(testDir, name), { recursive: true });
			writeJson(path.join(testDir, name, "package.json"), {
				cloudflare: { publish: true },
			});
		}
		fs.mkdirSync(path.join(testDir, "unpublished-template"), {
			recursive: true,
		});
		writeJson(path.join(testDir, "unpublished-template", "package.json"), {
			cloudflare: { publish: false },
		});
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(testDir, { recursive: true, force: true });
	});

	function mockExecFile(behavior: Behavior = () => null) {
		const calls: Call[] = [];
		vi.spyOn(subprocess, "execFile").mockImplementation(((
			file: string,
			args: string[],
			options: { cwd: string },
			callback: (error: Error | null, stdout: string, stderr: string) => void,
		) => {
			const call = { command: [file, ...args].join(" "), cwd: options.cwd };
			calls.push(call);
			Promise.resolve(behavior(call)).then((error) => callback(error, "", ""));
		}) as unknown as typeof subprocess.execFile);
		return calls;
	}

	function deployedDirs(calls: Call[]) {
		return calls
			.filter(({ command }) => command === "npm run deploy")
			.map(({ cwd }) => path.basename(cwd));
	}

	test("deploys every published template", async () => {
		const calls = mockExecFile();
		await expect(deployLiveDemos({ templateDirectory: testDir })).resolves.toBe(
			"Deployed 3 of 3 live demos.",
		);
		expect(deployedDirs(calls).sort()).toEqual(names);
	});

	test("runs install, build, and deploy in order for each template", async () => {
		const calls = mockExecFile();
		await deployLiveDemos({ templateDirectory: testDir });
		for (const name of names) {
			expect(
				calls
					.filter(({ cwd }) => path.basename(cwd) === name)
					.map(({ command }) => command),
			).toEqual([
				"npm install --force",
				"npm run build --if-present",
				"npm run deploy",
			]);
		}
	});

	test("keeps deploying after a failure and reports it at the end", async () => {
		const calls = mockExecFile(({ command, cwd }) =>
			command === "npm run deploy" && cwd.endsWith("a-template")
				? new Error("deploy failed")
				: null,
		);

		const result = deployLiveDemos({ templateDirectory: testDir });
		await expect(result).rejects.toBeInstanceOf(MarkdownError);
		await expect(result).rejects.toMatchObject({
			message: "Failed to deploy 1 of 3 live demos.",
			markdown: expect.stringContaining("- ❌ a-template"),
		});
		expect(deployedDirs(calls).sort()).toEqual(names);
	});

	test("skips later steps for a template whose build fails", async () => {
		const calls = mockExecFile(({ command, cwd }) =>
			command === "npm run build --if-present" && cwd.endsWith("b-template")
				? new Error("build failed")
				: null,
		);

		await expect(
			deployLiveDemos({ templateDirectory: testDir }),
		).rejects.toMatchObject({ message: "Failed to deploy 1 of 3 live demos." });
		expect(deployedDirs(calls).sort()).toEqual(["a-template", "c-template"]);
	});

	test("deploys templates concurrently, up to the limit", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		mockExecFile(async () => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight--;
			return null;
		});

		await deployLiveDemos({ templateDirectory: testDir, concurrency: 2 });
		expect(maxInFlight).toBe(2);
	});
});

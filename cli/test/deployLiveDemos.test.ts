import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import subprocess from "node:child_process";
import deployLiveDemos from "../src/deployLiveDemos";
import MarkdownError from "../src/MarkdownError";
import { writeJson } from "../src/util";

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

	function deployedDirs(spy: { mock: { calls: unknown[][] } }) {
		return spy.mock.calls
			.filter(([command]) => command === "npm run deploy")
			.map(([, options]) => path.basename((options as { cwd: string }).cwd));
	}

	test("deploys every published template", async () => {
		const spy = vi.spyOn(subprocess, "execSync").mockReturnValue("");
		await expect(deployLiveDemos({ templateDirectory: testDir })).resolves.toBe(
			"Deployed 3 of 3 live demos.",
		);
		expect(deployedDirs(spy).sort()).toEqual(names);
	});

	test("keeps deploying after a failure and reports it at the end", async () => {
		const spy = vi
			.spyOn(subprocess, "execSync")
			.mockImplementation((command, options) => {
				const cwd = (options as { cwd: string }).cwd;
				if (command === "npm run deploy" && cwd.endsWith("a-template")) {
					throw new Error("deploy failed");
				}
				return "";
			});

		const result = deployLiveDemos({ templateDirectory: testDir });
		await expect(result).rejects.toBeInstanceOf(MarkdownError);
		await expect(result).rejects.toMatchObject({
			message: "Failed to deploy 1 of 3 live demos.",
			markdown: expect.stringContaining("- ❌ a-template"),
		});
		expect(deployedDirs(spy).sort()).toEqual(names);
	});
});

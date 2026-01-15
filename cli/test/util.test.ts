import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getTemplates, readJson, writeJson } from "../src/util";

describe("util", () => {
	const testDir = path.join(__dirname, "test-templates");
	const dashTemplate = path.join(testDir, "dash-template");
	const nonDashTemplate = path.join(testDir, "other-template");

	// Setup and cleanup test directories
	beforeEach(() => {
		fs.mkdirSync(testDir, { recursive: true });
		fs.mkdirSync(dashTemplate, { recursive: true });
		fs.mkdirSync(nonDashTemplate, { recursive: true });

		// Create package.json with publish: true
		writeJson(path.join(dashTemplate, "package.json"), {
			cloudflare: { publish: true },
		});

		// Create package.json without dash
		writeJson(path.join(nonDashTemplate, "package.json"), {
			cloudflare: { publish: false },
		});
	});

	afterEach(() => {
		fs.rmSync(testDir, { recursive: true, force: true });
	});

	describe("getTemplates", () => {
		test("should return only dash templates when scanning directory", () => {
			const templates = getTemplates(testDir);
			expect(templates).toHaveLength(1);
			expect(templates[0].name).toBe("dash-template");
			expect(templates[0].path).toBe(dashTemplate);
		});

		test("should return empty array for non-dash template directory", () => {
			const templates = getTemplates(nonDashTemplate);
			expect(templates).toHaveLength(0);
		});

		test("should return single template for dash template directory", () => {
			const templates = getTemplates(dashTemplate);
			expect(templates).toHaveLength(1);
			expect(templates[0].name).toBe("dash-template");
			expect(templates[0].path).toBe(dashTemplate);
		});

		test("should handle missing package.json", () => {
			const missingPkgTemplate = path.join(testDir, "missing-pkg-template");
			fs.mkdirSync(missingPkgTemplate, { recursive: true });
			const templates = getTemplates(testDir);
			expect(templates).toHaveLength(1); // Only the original dash template
		});

		test("should handle invalid package.json", () => {
			const invalidPkgTemplate = path.join(testDir, "invalid-pkg-template");
			fs.mkdirSync(invalidPkgTemplate, { recursive: true });
			fs.writeFileSync(
				path.join(invalidPkgTemplate, "package.json"),
				"invalid json",
			);
			const templates = getTemplates(testDir);
			expect(templates).toHaveLength(1); // Only the original dash template
		});
	});

	describe("readJson/writeJson", () => {
		test("should read and write JSON files correctly", () => {
			const testFile = path.join(testDir, "test.json");
			const testData = { test: true };

			writeJson(testFile, testData);
			const read = readJson(testFile) as { test: boolean };

			expect(read.test).toBe(true);
		});
	});
});

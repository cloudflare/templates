// Captures docs/preview.png. Two modes:
//   default — local HTML card (Cloudflare + HyperFrames logos), matches Vercel template style
//   --live  — screenshot of the deployed site (composition rendered in player)

import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const live = args.includes("--live");
const out = args.find((a) => a.endsWith(".png")) ?? "docs/preview.png";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
	viewport: { width: 1200, height: 628 },
	deviceScaleFactor: 2,
});

if (live) {
	const url = "https://hyperframes-on-cloudflare.jdrusso1020.workers.dev/";
	await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
	await page.waitForFunction(
		() => document.querySelector("hyperframes-player")?.ready === true,
		null,
		{ timeout: 15000 },
	);
	await page.evaluate(() => {
		document.querySelector("hyperframes-player").currentTime = 4;
	});
	await page.waitForTimeout(1500);
} else {
	const html = await readFile(resolve("scripts/preview-card.html"), "utf8");
	await page.setContent(html, { waitUntil: "networkidle" });
}

await page.screenshot({ path: out, fullPage: false });
console.log(`wrote ${out}`);
await browser.close();

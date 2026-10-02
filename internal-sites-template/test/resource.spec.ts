import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { PutStaticSiteInDispatchNamespace } from "../src/resource";
import type { UploadedAsset } from "../src/types";
import { fetchMock } from "./fetch-mock";

const API_ORIGIN = "https://api.cloudflare.com";
const SCRIPT_NAME = "mime-types-test";
const SCRIPT_PATH = `/client/v4/accounts/test-account/workers/dispatch/namespaces/internal-sites/scripts/${SCRIPT_NAME}`;

const deploymentEnv = {
	ACCOUNT_ID: "test-account",
	DISPATCH_NAMESPACE_NAME: "internal-sites",
	DISPATCH_NAMESPACE_API_TOKEN: "test-api-token",
} as Env;

beforeAll(() => {
	fetchMock.activate();
	fetchMock.disableNetConnect();
});

afterAll(() => {
	fetchMock.assertNoPendingInterceptors();
});

describe("static asset uploads", () => {
	it("uploads assets as file parts with their content types", async () => {
		const assets: UploadedAsset[] = [
			{
				path: "index.html",
				content: new TextEncoder().encode("<!doctype html><title>Test</title>"),
				contentType: "text/html; charset=utf-8",
			},
			{
				path: "styles.css",
				content: new TextEncoder().encode("body { color: rebeccapurple; }"),
				contentType: "text/css; charset=utf-8",
			},
		];
		let hashes: string[] = [];
		let assetUploadBody = "";

		fetchMock
			.get(API_ORIGIN)
			.intercept({
				path: `${SCRIPT_PATH}/assets-upload-session`,
				method: "POST",
			})
			.reply(200, async ({ body }) => {
				const request = JSON.parse(await readBody(body)) as {
					manifest: Record<string, { hash: string }>;
				};
				hashes = Object.values(request.manifest).map((asset) => asset.hash);
				return JSON.stringify({
					success: true,
					result: { jwt: "upload-jwt", buckets: [hashes] },
				});
			});

		fetchMock
			.get(API_ORIGIN)
			.intercept({
				path: "/client/v4/accounts/test-account/workers/assets/upload?base64=true",
				method: "POST",
			})
			.reply(200, async ({ body }) => {
				assetUploadBody = await readBody(body);
				return JSON.stringify({
					success: true,
					result: { jwt: "completion-jwt" },
				});
			});

		fetchMock
			.get(API_ORIGIN)
			.intercept({ path: SCRIPT_PATH, method: "PUT" })
			.reply(200, JSON.stringify({ success: true, result: {} }), {
				headers: { "content-type": "application/json" },
			});

		await PutStaticSiteInDispatchNamespace(deploymentEnv, SCRIPT_NAME, assets);

		for (const hash of hashes) {
			expect(assetUploadBody).toContain(
				`Content-Disposition: form-data; name="${hash}"; filename="${hash}"`,
			);
		}
		expect(assetUploadBody).toContain("Content-Type: text/css; charset=utf-8");
	});
});

async function readBody(body: unknown): Promise<string> {
	if (typeof body === "string") return body;
	if (body instanceof Uint8Array) return new TextDecoder().decode(body);

	const chunks: Uint8Array[] = [];
	for await (const chunk of body as AsyncIterable<Uint8Array>) {
		chunks.push(chunk);
	}
	const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

import { HttpError } from "./errors";

export type SourceEnv = {
	MAX_IMAGE_BYTES: number;
	MAX_REDIRECTS: number;
	FETCH_RETRIES: number;
	FETCH_TIMEOUT_MS: number;
};

export type FetchedSource = {
	url: string;
	bytes: ArrayBuffer;
	contentType: string;
};

const MAGIC_BYTES: { type: string; test: (bytes: Uint8Array) => boolean }[] = [
	{
		type: "image/jpeg",
		test: (b) =>
			b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	},
	{
		type: "image/png",
		test: (b) =>
			b.length >= 8 &&
			[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
				(byte, i) => b[i] === byte,
			),
	},
	{
		type: "image/gif",
		test: (b) =>
			b.length >= 6 &&
			b[0] === 0x47 &&
			b[1] === 0x49 &&
			b[2] === 0x46 &&
			b[3] === 0x38 &&
			(b[4] === 0x37 || b[4] === 0x39) &&
			b[5] === 0x61,
	},
	{
		type: "image/webp",
		test: (b) =>
			b.length >= 12 &&
			b[0] === 0x52 &&
			b[1] === 0x49 &&
			b[2] === 0x46 &&
			b[3] === 0x46 &&
			b[8] === 0x57 &&
			b[9] === 0x45 &&
			b[10] === 0x42 &&
			b[11] === 0x50,
	},
];

function detectContentType(bytes: Uint8Array): string | null {
	return MAGIC_BYTES.find((candidate) => candidate.test(bytes))?.type ?? null;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
	return Math.min(2000, 250 * 2 ** attempt);
}

type FetchOutcome =
	| { redirect: string }
	| { bytes: ArrayBuffer; contentType: string };

async function readBody(
	response: Response,
	maxBytes: number,
): Promise<ArrayBuffer> {
	if (!response.body) return new ArrayBuffer(0);

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) {
				await reader.cancel();
				throw new HttpError(413, `image exceeds the ${maxBytes} byte limit`);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes.buffer;
}

async function fetchOnce(url: string, env: SourceEnv): Promise<FetchOutcome> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), env.FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			redirect: "manual",
			signal: controller.signal,
		});
		if (response.status >= 500) {
			await response.body?.cancel();
			throw new Error("source server error");
		}
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location");
			await response.body?.cancel();
			if (!location)
				throw new HttpError(
					502,
					"redirect response is missing a location header",
				);
			return { redirect: location };
		}
		if (!response.ok) {
			await response.body?.cancel();
			throw new HttpError(502, `source returned status ${response.status}`);
		}

		const declaredLength = Number(response.headers.get("content-length"));
		if (
			Number.isFinite(declaredLength) &&
			declaredLength > env.MAX_IMAGE_BYTES
		) {
			await response.body?.cancel();
			throw new HttpError(
				413,
				`image exceeds the ${env.MAX_IMAGE_BYTES} byte limit`,
			);
		}

		const bytes = await readBody(response, env.MAX_IMAGE_BYTES);
		const contentType = detectContentType(new Uint8Array(bytes));
		if (!contentType) {
			throw new HttpError(
				415,
				"url did not return a supported image (jpeg, png, gif, or webp)",
			);
		}
		return { bytes, contentType };
	} finally {
		clearTimeout(timer);
	}
}

async function fetchWithRetry(
	url: string,
	env: SourceEnv,
): Promise<FetchOutcome> {
	for (let attempt = 0; attempt <= env.FETCH_RETRIES; attempt += 1) {
		try {
			return await fetchOnce(url, env);
		} catch (error) {
			if (error instanceof HttpError) throw error;
			if (attempt === env.FETCH_RETRIES) break;
			await sleep(backoffMs(attempt));
		}
	}
	throw new HttpError(502, "could not fetch the source image");
}

function validateUrl(url: URL, isRedirect = false): void {
	if (url.protocol !== "https:") {
		throw new HttpError(
			400,
			isRedirect ? "redirect target must use https" : "url must use https",
		);
	}
	if (url.username || url.password) {
		throw new HttpError(
			400,
			isRedirect
				? "redirect target must not include credentials"
				: "url must not include credentials",
		);
	}
}

function validateConfig(env: SourceEnv): void {
	const valid =
		Number.isInteger(env.MAX_IMAGE_BYTES) &&
		env.MAX_IMAGE_BYTES > 0 &&
		Number.isInteger(env.MAX_REDIRECTS) &&
		env.MAX_REDIRECTS >= 0 &&
		env.MAX_REDIRECTS <= 10 &&
		Number.isInteger(env.FETCH_RETRIES) &&
		env.FETCH_RETRIES >= 0 &&
		env.FETCH_RETRIES <= 5 &&
		Number.isInteger(env.FETCH_TIMEOUT_MS) &&
		env.FETCH_TIMEOUT_MS > 0 &&
		env.FETCH_TIMEOUT_MS <= 60_000;
	if (!valid) throw new HttpError(500, "server fetch limits are misconfigured");
}

export async function fetchSource(
	rawUrl: string,
	env: SourceEnv,
): Promise<FetchedSource> {
	validateConfig(env);
	let current: URL;
	try {
		current = new URL(rawUrl);
	} catch {
		throw new HttpError(400, "url is not a valid URL");
	}
	validateUrl(current);

	for (let redirect = 0; redirect <= env.MAX_REDIRECTS; redirect += 1) {
		const outcome = await fetchWithRetry(current.toString(), env);
		if ("redirect" in outcome) {
			try {
				current = new URL(outcome.redirect, current);
			} catch {
				throw new HttpError(
					502,
					"source returned an invalid redirect location",
				);
			}
			validateUrl(current, true);
			continue;
		}
		return { url: current.toString(), ...outcome };
	}

	throw new HttpError(
		502,
		"too many redirects while fetching the source image",
	);
}

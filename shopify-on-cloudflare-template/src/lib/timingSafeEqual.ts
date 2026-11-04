const encoder = new TextEncoder();

/**
 * Timing-safe string comparison using the Cloudflare Workers runtime's
 * `crypto.subtle.timingSafeEqual` extension.
 *
 * @see https://developers.cloudflare.com/workers/runtime-apis/web-crypto/#timingsafeequal
 * @see https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/
 *
 * Non-Workers runtimes (Node/vitest) lack `timingSafeEqual` on `crypto.subtle`;
 * there we fall back to a constant-time XOR fold over the raw bytes.
 */
export function timingSafeEqual(a: string, b: string): boolean {
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);

	// Do not return early when lengths differ — that leaks the secret's
	// length through timing. Compare against self and negate instead.
	if (aBytes.byteLength !== bBytes.byteLength) {
		return !safeEqual(aBytes, aBytes);
	}

	return safeEqual(aBytes, bBytes);
}

function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
	// `timingSafeEqual` is a Cloudflare Workers runtime extension not present in
	// TS's DOM lib typings (worker-configuration.d.ts is module-scoped) — widen
	// the type locally instead of casting through `any`.
	type SubtleCryptoWithTimingSafe = SubtleCrypto & {
		timingSafeEqual?: (
			a: ArrayBuffer | ArrayBufferView,
			b: ArrayBuffer | ArrayBufferView,
		) => boolean;
	};
	const subtle = crypto.subtle as SubtleCryptoWithTimingSafe;

	if (typeof subtle.timingSafeEqual === "function") {
		return subtle.timingSafeEqual(a, b);
	}

	// Node fallback (constant-time XOR fold; same semantics as workerd's implementation)
	if (a.byteLength !== b.byteLength) return false;
	let diff = 0;
	for (let i = 0; i < a.byteLength; i++) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}

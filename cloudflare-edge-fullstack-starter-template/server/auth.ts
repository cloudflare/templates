// better-auth, configured for Cloudflare.
//
// Two deliberate choices that keep this cheap and fast on Workers:
//
//   1. Sessions in KV only (secondaryStorage + storeSessionInDatabase: false).
//      The auth check on every request becomes a ~ms edge KV read instead of a
//      billed D1 row read. We do NOT enable cookieCache — with secondaryStorage
//      that triggers better-auth #4203 (users logged out after exactly 5 min).
//
//   2. PBKDF2-SHA256 password hashing via Web Crypto (native, no wasm).
//      better-auth's default scrypt-via-wasm runs right at the Workers free-tier
//      10ms CPU edge and intermittently throws 1102. Native PBKDF2 is ~1-5ms.
//
// Auth is same-origin here (the SPA and this API are one Worker), so the session
// cookie is first-party — no SameSite=None / cross-site cookie gymnastics, and
// it works in Safari without a custom domain.

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import type { Bindings } from "./env.ts";
import { schema } from "./schema.ts";

// OWASP's floor for PBKDF2-SHA256 is 600k, but that exceeds the Workers FREE
// plan's 10ms CPU budget per sign-in. 100k stays comfortably under it and is
// respectable for a typical app (AWS Cognito uses a PBKDF2 variant). On the
// Workers PAID plan (30s CPU) you can safely raise this toward 600k.
const PBKDF2_ITERATIONS = 100_000;

function toB64(buf: Uint8Array): string {
	let s = "";
	for (let i = 0; i < buf.byteLength; i++) s += String.fromCharCode(buf[i]);
	return btoa(s);
}

function fromB64(s: string): Uint8Array {
	const bin = atob(s);
	const arr = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
	return arr;
}

async function pbkdf2(
	password: string,
	salt: Uint8Array,
	iterations: number,
	bytes: number,
): Promise<Uint8Array> {
	const enc = new TextEncoder().encode(password) as unknown as BufferSource;
	const key = await crypto.subtle.importKey("raw", enc, "PBKDF2", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: salt as unknown as BufferSource,
			iterations,
			hash: "SHA-256",
		},
		key,
		bytes * 8,
	);
	return new Uint8Array(bits);
}

async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS, 32);
	return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

async function verifyPassword({
	hash,
	password,
}: {
	hash: string;
	password: string;
}): Promise<boolean> {
	const parts = hash.split("$");
	if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
	const iterations = parseInt(parts[1], 10);
	if (!Number.isInteger(iterations) || iterations < 1000) return false;
	const salt = fromB64(parts[2]);
	const expected = fromB64(parts[3]);
	const got = await pbkdf2(password, salt, iterations, expected.byteLength);
	if (got.byteLength !== expected.byteLength) return false;
	let diff = 0;
	for (let i = 0; i < got.byteLength; i++) diff |= got[i] ^ expected[i];
	return diff === 0;
}

export function createAuth(env: Bindings, baseURL: string) {
	const db = drizzle(env.DB, { schema });
	return betterAuth({
		database: drizzleAdapter(db, { provider: "sqlite", schema }),
		secret: env.BETTER_AUTH_SECRET,
		baseURL,
		// Same-origin app — trust this Worker's own origin for the CSRF/Origin check.
		trustedOrigins: [baseURL],
		emailAndPassword: {
			enabled: true,
			// No email provider is wired in this zero-config template, so we don't
			// require verification (there'd be no way to deliver the link). To turn
			// it on, add an email sender (e.g. Resend or Cloudflare Email) and set
			// requireEmailVerification: true. See the README "Going further" note.
			requireEmailVerification: false,
			password: {
				hash: hashPassword,
				verify: verifyPassword,
			},
		},
		session: {
			storeSessionInDatabase: false,
			expiresIn: 60 * 60 * 24 * 7,
			updateAge: 60 * 60 * 24,
		},
		secondaryStorage: {
			get: async (key) => (await env.SESSIONS.get(key)) ?? null,
			set: async (key, value, ttl) => {
				const opts =
					ttl != null ? { expirationTtl: Math.max(ttl, 60) } : undefined;
				await env.SESSIONS.put(key, value, opts);
			},
			delete: async (key) => env.SESSIONS.delete(key),
		},
		advanced: {
			// Workers put the real client IP in cf-connecting-ip. Without this,
			// better-auth's per-IP rate limiting silently disables.
			ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
		},
	});
}

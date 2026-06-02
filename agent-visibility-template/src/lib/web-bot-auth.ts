/**
 * OPTIONAL — Web Bot Auth (agent identity).
 *
 * Everything else in this template is about making content *readable* by
 * agents. This module is a different axis: letting a well-behaved agent prove
 * *who it is* using Web Bot Auth (HTTP Message Signatures, RFC 9421, with
 * Ed25519 keys). It is disabled by default (`ENABLE_WEB_BOT_AUTH=false`) and
 * is wired up separately so it never muddies the core "readable surfaces"
 * story.
 *
 * What this provides:
 *   - GET /.well-known/web-bot-auth/directory  — the keys this site trusts
 *   - verifyAgentIdentity(request)             — verify a signed request
 *
 * This is a minimal, dependency-free starting point. It verifies an Ed25519
 * signature over a signature base built from the components named in
 * `Signature-Input`. For production use, review the latest Web Bot Auth /
 * RFC 9421 drafts and harden component coverage, key rotation, and replay
 * protection (the `created`/`expires`/`nonce` params).
 */

/** An accepted agent public key (Ed25519, JWK form). */
export interface AgentKey {
	keyid: string;
	/** Base64url Ed25519 public key (the `x` field of an OKP JWK). */
	publicKey: string;
	/** Friendly label, e.g. "ExampleAI crawler". */
	label?: string;
}

/**
 * Sample directory. Replace with the keys of agents you actually trust. The
 * sample key is illustrative only and will not verify real traffic.
 */
export const SAMPLE_AGENT_KEYS: AgentKey[] = [
	{
		keyid: "sample-agent-2026",
		publicKey: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
		label: "Sample agent (replace me)",
	},
];

export interface VerificationResult {
	/** Whether the request carried Web Bot Auth signature headers at all. */
	signed: boolean;
	/** Whether the signature verified against a trusted key. */
	verified: boolean;
	/** The keyid the agent claimed, if any. */
	keyid?: string;
	/** Human-readable reason when not verified. */
	reason?: string;
}

function b64urlToBytes(s: string): Uint8Array {
	const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
	const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** Parse a Signature-Input value like: sig1=("@authority" "@path");keyid="k". */
function parseSignatureInput(
	value: string,
): { label: string; components: string[]; keyid?: string } | null {
	const eq = value.indexOf("=");
	if (eq === -1) return null;
	const label = value.slice(0, eq).trim();
	const rest = value.slice(eq + 1);
	const compMatch = rest.match(/\(([^)]*)\)/);
	if (!compMatch) return null;
	const components = (compMatch[1].match(/"([^"]+)"/g) ?? []).map((c) =>
		c.replace(/"/g, ""),
	);
	const keyidMatch = rest.match(/keyid="([^"]+)"/);
	return { label, components, keyid: keyidMatch?.[1] };
}

/** Build the signature base string from the covered components. */
function buildSignatureBase(
	request: Request,
	components: string[],
	signatureParams: string,
): string {
	const url = new URL(request.url);
	const lines: string[] = [];
	for (const comp of components) {
		let val = "";
		if (comp === "@authority") val = url.host;
		else if (comp === "@path") val = url.pathname;
		else if (comp === "@method") val = request.method;
		else if (comp === "@target-uri") val = request.url;
		else val = request.headers.get(comp) ?? "";
		lines.push(`"${comp}": ${val}`);
	}
	lines.push(`"@signature-params": ${signatureParams}`);
	return lines.join("\n");
}

/**
 * Verify the Web Bot Auth signature on an incoming request.
 *
 * Returns `{ signed: false }` for unsigned requests (the common case) so the
 * caller can decide what to do — this template just surfaces the result.
 */
export async function verifyAgentIdentity(
	request: Request,
	keys: AgentKey[],
): Promise<VerificationResult> {
	const sigInput = request.headers.get("Signature-Input");
	const sigHeader = request.headers.get("Signature");
	if (!sigInput || !sigHeader) return { signed: false, verified: false };

	const parsed = parseSignatureInput(sigInput);
	if (!parsed) {
		return {
			signed: true,
			verified: false,
			reason: "Malformed Signature-Input",
		};
	}

	// The label is attacker-controlled; only allow the RFC 8941 key charset so
	// it can't inject regex metacharacters (ReDoS / RegExp throw).
	if (!/^[A-Za-z0-9_-]+$/.test(parsed.label)) {
		return { signed: true, verified: false, reason: "Invalid signature label" };
	}

	const key = keys.find((k) => k.keyid === parsed.keyid);
	if (!key) {
		return {
			signed: true,
			verified: false,
			keyid: parsed.keyid,
			reason: "Unknown keyid",
		};
	}

	try {
		// Extract the raw signature bytes for this label.
		const sigMatch = sigHeader.match(new RegExp(`${parsed.label}=:([^:]+):`));
		if (!sigMatch) {
			return {
				signed: true,
				verified: false,
				keyid: parsed.keyid,
				reason: "Missing signature value",
			};
		}

		const paramsMatch = sigInput.match(/=(\(.*)$/);
		const signatureParams = paramsMatch ? paramsMatch[1] : "()";
		const base = buildSignatureBase(
			request,
			parsed.components,
			signatureParams,
		);

		const cryptoKey = await crypto.subtle.importKey(
			"raw",
			b64urlToBytes(key.publicKey),
			{ name: "Ed25519" },
			false,
			["verify"],
		);
		const ok = await crypto.subtle.verify(
			"Ed25519",
			cryptoKey,
			b64urlToBytes(sigMatch[1]),
			new TextEncoder().encode(base),
		);
		return {
			signed: true,
			verified: ok,
			keyid: parsed.keyid,
			reason: ok ? undefined : "Signature did not verify",
		};
	} catch (err) {
		return {
			signed: true,
			verified: false,
			keyid: parsed.keyid,
			reason: `Verification error: ${(err as Error).message}`,
		};
	}
}

/** The directory document served at /.well-known/web-bot-auth/directory. */
export function directoryDocument(keys: AgentKey[]) {
	return {
		purpose: "web-bot-auth",
		description:
			"Public keys this site trusts for Web Bot Auth (RFC 9421, Ed25519).",
		keys: keys.map((k) => ({
			keyid: k.keyid,
			kty: "OKP",
			crv: "Ed25519",
			x: k.publicKey,
			label: k.label,
		})),
	};
}

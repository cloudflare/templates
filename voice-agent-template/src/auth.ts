const textEncoder = new TextEncoder();

interface VoiceAgentAuthEnv {
	VOICE_AGENT_TOKEN?: string;
}

function jsonError(
	error: string,
	status: number,
	authenticate = false,
): Response {
	const headers = new Headers({
		"cache-control": "no-store",
		"content-type": "application/json; charset=utf-8",
	});
	if (authenticate) {
		headers.set("www-authenticate", 'Bearer realm="voice-agent"');
	}
	return Response.json({ error }, { status, headers });
}

function readBearerToken(request: Request): string | null {
	const authorization = request.headers.get("authorization");
	if (!authorization) return null;

	const match = /^Bearer ([^\s]+)$/i.exec(authorization);
	return match?.[1] ?? null;
}

async function sha256(value: string): Promise<Uint8Array> {
	return new Uint8Array(
		await crypto.subtle.digest("SHA-256", textEncoder.encode(value)),
	);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
	let difference = left.length ^ right.length;
	const length = Math.max(left.length, right.length);
	for (let index = 0; index < length; index += 1) {
		difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
	}
	return difference === 0;
}

async function tokensMatch(
	supplied: string,
	configured: string,
): Promise<boolean> {
	const [suppliedHash, configuredHash] = await Promise.all([
		sha256(supplied),
		sha256(configured),
	]);
	return equalBytes(suppliedHash, configuredHash);
}

export async function authorizeVoiceAgentRequest(
	request: Request,
	env: VoiceAgentAuthEnv,
): Promise<Response | undefined> {
	const configuredToken = env.VOICE_AGENT_TOKEN;
	if (!configuredToken) {
		return jsonError("Voice agent authentication is not configured.", 503);
	}

	const suppliedToken = readBearerToken(request);
	if (!suppliedToken || !(await tokensMatch(suppliedToken, configuredToken))) {
		return jsonError("Unauthorized.", 401, true);
	}
}

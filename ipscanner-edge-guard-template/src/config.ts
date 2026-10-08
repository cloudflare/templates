export interface Config {
	apiKey: string;
	apiUrl: string;
	originUrl: string;
	enforce: boolean;
	checkAgent: boolean;
	checkIp: boolean;
	blockClasses: string[];
	blockAnonymized: boolean;
	timeoutMs: number;
	agentTtl: number;
	ipTtl: number;
	skipPaths: RegExp | null;
}

let skipSource: string | undefined;
let skipRegex: RegExp | null = null;

function flag(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value === "") return fallback;
	return value.trim().toLowerCase() === "true";
}

function int(value: string | undefined, fallback: number): number {
	const n = Number.parseInt(value ?? "", 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

function compileSkipPaths(source: string): RegExp | null {
	if (source === skipSource) return skipRegex;
	skipSource = source;
	try {
		skipRegex = source ? new RegExp(source, "i") : null;
	} catch {
		console.log(
			JSON.stringify({ ipscanner: "invalid SKIP_PATHS", value: source }),
		);
		skipRegex = null;
	}
	return skipRegex;
}

export function loadConfig(env: Partial<Env>): Config {
	return {
		apiKey: (env.IPSCANNER_API_KEY ?? "").trim(),
		apiUrl: (env.IPSCANNER_API_URL || "https://ipscanner.io").replace(
			/\/+$/,
			"",
		),
		originUrl: (env.ORIGIN_URL ?? "").trim(),
		enforce: (env.MODE ?? "").trim().toLowerCase() === "enforce",
		checkAgent: flag(env.CHECK_AGENT, true),
		checkIp: flag(env.CHECK_IP, true),
		blockClasses: (env.BLOCK_CLASSES ?? "malicious_automation")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
		blockAnonymized: flag(env.BLOCK_ANONYMIZED, false),
		timeoutMs: int(env.TIMEOUT_MS, 1500),
		agentTtl: int(env.AGENT_TTL, 600),
		ipTtl: int(env.IP_TTL, 3600),
		skipPaths: compileSkipPaths(env.SKIP_PATHS ?? ""),
	};
}

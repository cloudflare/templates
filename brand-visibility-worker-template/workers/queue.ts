/**
 * Queue consumer — processes individual model×prompt test jobs via AI Gateway.
 * Each job writes its result to a separate KV key to avoid race conditions.
 */
import { RETENTION_DAYS, SYSTEM_PROMPT } from "../src/config";
import type { QueueJob } from "./api";

type Env = {
	AI: Ai;
	AEO_KV: KVNamespace;
};

type Citation = {
	model: string;
	provider: string;
	prompt: string;
	mentioned: boolean;
	excerpt: string | null;
	response: string;
};

export async function queueConsumer(
	batch: MessageBatch<QueueJob>,
	env: Env,
): Promise<void> {
	for (const msg of batch.messages) {
		const job = msg.body;
		try {
			const citation = await executeJob(env, job);
			const citeKey = `test:${job.testId}:cite:${crypto.randomUUID().slice(0, 8)}`;
			await env.AEO_KV.put(citeKey, JSON.stringify(citation), {
				expirationTtl: RETENTION_DAYS * 86400,
			});
			msg.ack();
		} catch (err) {
			console.error(`Job failed: ${err}`);
			msg.retry();
		}
	}
}

async function executeJob(env: Env, job: QueueJob): Promise<Citation> {
	try {
		const text = await callModel(env, job);
		const mentioned = text.toLowerCase().includes(job.domain);
		let excerpt: string | null = null;

		if (mentioned) {
			const i = text.toLowerCase().indexOf(job.domain);
			excerpt = text.slice(
				Math.max(0, i - 100),
				Math.min(text.length, i + job.domain.length + 100),
			);
		}

		return {
			model: job.modelName,
			provider: job.provider,
			prompt: job.prompt,
			mentioned,
			excerpt,
			response: text.slice(0, 500),
		};
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		const isBillingError =
			/billing|credit|payment|insufficient|quota|budget/i.test(errMsg);
		const response = isBillingError
			? "Unified Billing credits required. Load credits at dash.cloudflare.com → AI Gateway → Billing."
			: `Error: ${errMsg}`;

		return {
			model: job.modelName,
			provider: job.provider,
			prompt: job.prompt,
			mentioned: false,
			excerpt: null,
			response,
		};
	}
}

/**
 * Universal model caller — all models go through env.AI.run() with AI Gateway.
 * Handles OpenAI/Anthropic (messages format) and Gemini (contents format).
 * Falls back to mock responses when AI binding is unavailable.
 */
async function callModel(env: Env, job: QueueJob): Promise<string> {
	// If AI binding is not available, return mock response
	if (!env.AI) {
		console.log("AI binding not available, using mock response");
		return `Mock AI response from ${job.modelName}`;
	}

	let input: any;

	if (job.isGemini) {
		// Gemini format
		input = {
			contents: [
				{
					role: "user",
					parts: [{ text: `${SYSTEM_PROMPT}\n\n${job.prompt}` }],
				},
			],
			generationConfig: { maxOutputTokens: job.maxTokens },
		};
	} else if (job.isAnthropic) {
		// Anthropic format
		input = {
			system: SYSTEM_PROMPT,
			messages: [{ role: "user", content: job.prompt }],
			max_tokens: job.maxTokens,
		};
	} else {
		// OpenAI/Workers AI format - supports system role
		input = {
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: job.prompt },
			],
			max_tokens: job.maxTokens,
		};
	}

	const r = await env.AI.run(job.modelId as Parameters<Ai["run"]>[0], input, {
		gateway: { id: "default" },
	});

	return extractText(r);
}

/** Extract text from any AI response format */
function extractText(r: any): string {
	if (typeof r === "string") return r;
	if (!r || typeof r !== "object") return String(r);

	// Workers AI: { response: "..." }
	if ("response" in r && typeof r.response === "string") return r.response;

	// OpenAI/Anthropic: { choices: [{ message: { content: "..." } }] }
	if (r.choices && Array.isArray(r.choices)) {
		for (const choice of r.choices) {
			const msg = choice.message ?? choice.delta;
			if (msg?.content && typeof msg.content === "string") return msg.content;
			if (msg?.reasoning_content && typeof msg.reasoning_content === "string")
				return msg.reasoning_content;
		}
	}

	// Gemini: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
	if (r.candidates && Array.isArray(r.candidates)) {
		const text = r.candidates[0]?.content?.parts?.[0]?.text;
		if (text) return text;
	}

	// Anthropic messages: { content: [{ type: "text", text: "..." }] }
	if (Array.isArray(r.content)) {
		const tb = r.content.find((b: any) => b.type === "text" && b.text);
		if (tb) return tb.text;
	}

	// Last resort: regex content extraction
	const s = JSON.stringify(r);
	const m = s.match(/"(?:content|text)"\s*:\s*"((?:[^"\\]|\\.)*)"/);
	if (m) return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
	return s;
}

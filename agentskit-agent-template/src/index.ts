import type { Message, MessageRole } from "@agentskit/core";
import { createWorkersAIAdapter, MODEL_ID } from "./adapter";

export interface Env {
	AI: Ai;
	ASSETS: Fetcher;
}

interface ChatInput {
	messages: Array<{ role: Exclude<MessageRole, "tool">; content: string }>;
}

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_TOTAL_LENGTH = 20_000;
const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);

function json(data: unknown, status = 200): Response {
	return Response.json(data, {
		status,
		headers: { "cache-control": "no-store" },
	});
}

function validateChatInput(value: unknown): ChatInput | string {
	if (!value || typeof value !== "object" || !("messages" in value)) {
		return "messages[] is required";
	}

	const messages = (value as { messages?: unknown }).messages;
	if (!Array.isArray(messages) || messages.length === 0) {
		return "messages[] must contain at least one message";
	}
	if (messages.length > MAX_MESSAGES) {
		return `messages[] cannot contain more than ${MAX_MESSAGES} messages`;
	}

	let totalLength = 0;
	for (const message of messages) {
		if (!message || typeof message !== "object") return "invalid message";
		const { role, content } = message as Record<string, unknown>;
		if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) {
			return "message role must be system, user, or assistant";
		}
		if (typeof content !== "string" || content.trim().length === 0) {
			return "message content must be a non-empty string";
		}
		if (content.length > MAX_MESSAGE_LENGTH) {
			return `message content cannot exceed ${MAX_MESSAGE_LENGTH} characters`;
		}
		totalLength += content.length;
	}

	if (totalLength > MAX_TOTAL_LENGTH) {
		return `combined message content cannot exceed ${MAX_TOTAL_LENGTH} characters`;
	}

	return { messages } as ChatInput;
}

function toAgentsKitMessages(input: ChatInput): Message[] {
	return input.messages.map((message, index) => ({
		id: String(index),
		role: message.role,
		content: message.content,
		status: "complete",
		createdAt: new Date(),
	}));
}

async function chat(request: Request, env: Env): Promise<Response> {
	if (request.method !== "POST") {
		return json({ error: "Method not allowed" }, 405);
	}
	if (!env.AI) {
		return json({ error: "Workers AI binding is not configured" }, 500);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Request body must be valid JSON" }, 400);
	}

	const input = validateChatInput(body);
	if (typeof input === "string") return json({ error: input }, 400);

	const source = createWorkersAIAdapter(env.AI).createSource({
		messages: toAgentsKitMessages(input),
		context: { maxTokens: 768 },
	});
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const chunk of source.stream()) {
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
					);
				}
			} finally {
				controller.close();
			}
		},
		cancel() {
			source.abort();
		},
	});

	return new Response(stream, {
		headers: {
			"cache-control": "no-cache, no-transform",
			"content-type": "text/event-stream; charset=utf-8",
			"x-content-type-options": "nosniff",
		},
	});
}

export async function handleRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	const url = new URL(request.url);
	if (url.pathname === "/api/health") {
		return json({ ok: true, adapter: "AgentsKit", model: MODEL_ID });
	}
	if (url.pathname === "/api/chat") return chat(request, env);
	if (url.pathname.startsWith("/api/")) {
		return json({ error: "Not found" }, 404);
	}
	return env.ASSETS.fetch(request);
}

export default {
	fetch: handleRequest,
} satisfies ExportedHandler<Env>;

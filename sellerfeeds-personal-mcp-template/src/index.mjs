const VERSION = "1.0.0";
const CORS = Object.freeze({
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
	"Access-Control-Allow-Headers":
		"Content-Type,Authorization,MCP-Protocol-Version,Mcp-Session-Id",
	"Access-Control-Expose-Headers": "MCP-Protocol-Version,Mcp-Session-Id",
	"Cache-Control": "no-store",
});
const TOOL_NAME = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TOOLS = 300;
const INTRODUCTION = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,">
<title>Personal MCP for Browser Tools</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:52rem;margin:4rem auto;padding:0 1.5rem;color:#172334}h1{line-height:1.2}a{color:#195ab7}.card{padding:1.5rem;border:1px solid #d9e1eb;border-radius:1rem;background:#f8fbff}</style>
</head><body><main class="card"><h1>Personal MCP for Browser Tools</h1>
<p>Run your own MCP gateway on Cloudflare with D1, R2, and Durable Objects. Connect a SellerFeeds browser extension to expose your installed tools to your MCP client.</p>
<p>Each deployment uses its own OWNER_TOKEN. The gateway does not serve reports or tool details on this public page.</p>
<p><a href="https://github.com/omococola/mcp">Setup guide and source code</a></p>
</main></body></html>`;

function json(value, status = 200, headers = {}) {
	return new Response(JSON.stringify(value), {
		status,
		headers: {
			...CORS,
			"Content-Type": "application/json; charset=utf-8",
			...headers,
		},
	});
}

function now() {
	return new Date().toISOString();
}
function rpc(id, result = null, error = null) {
	return error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result };
}

async function readJson(request, maximum = 2 * 1024 * 1024) {
	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > maximum)
		throw Object.assign(new Error("request too large"), { status: 413 });
	try {
		return text ? JSON.parse(text) : {};
	} catch (_) {
		throw Object.assign(new Error("invalid JSON"), { status: 400 });
	}
}

function bearer(request) {
	const match = /^Bearer\s+(.+)$/i.exec(
		request.headers.get("Authorization") || "",
	);
	return String(match?.[1] || "");
}

function sameSecret(left, right) {
	const a = new TextEncoder().encode(String(left || ""));
	const b = new TextEncoder().encode(String(right || ""));
	let difference = a.length ^ b.length;
	const length = Math.max(a.length, b.length);
	for (let index = 0; index < length; index += 1)
		difference |= (a[index] || 0) ^ (b[index] || 0);
	return difference === 0 && a.length > 24;
}

function decodeBase64Url(value) {
	try {
		const normalized = String(value || "")
			.replace(/-/g, "+")
			.replace(/_/g, "/");
		const binary = atob(
			normalized + "=".repeat((4 - (normalized.length % 4)) % 4),
		);
		return new TextDecoder().decode(
			Uint8Array.from(binary, (character) => character.charCodeAt(0)),
		);
	} catch (_) {
		return "";
	}
}

function socketToken(request) {
	const protocols = String(request.headers.get("Sec-WebSocket-Protocol") || "")
		.split(",")
		.map((value) => value.trim());
	const encoded =
		protocols.find((value) => value.startsWith("auth."))?.slice(5) || "";
	return decodeBase64Url(encoded);
}

function authorized(request, env) {
	return sameSecret(bearer(request), env.OWNER_TOKEN);
}

let schemaReady = null;
async function ensureSchema(env) {
	if (schemaReady) return schemaReady;
	schemaReady = env.DB.batch([
		env.DB.prepare(
			"CREATE TABLE IF NOT EXISTS tool_catalog (singleton INTEGER PRIMARY KEY CHECK(singleton=1),device_id TEXT NOT NULL,catalog_hash TEXT NOT NULL DEFAULT '',tools_json TEXT NOT NULL DEFAULT '[]',updated_at TEXT NOT NULL)",
		),
		env.DB.prepare(
			"CREATE TABLE IF NOT EXISTS mcp_holder (singleton INTEGER PRIMARY KEY CHECK(singleton=1),device_id TEXT NOT NULL,claimed_at TEXT NOT NULL,last_seen TEXT NOT NULL)",
		),
		env.DB.prepare(
			"CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY,device_id TEXT NOT NULL DEFAULT '',tool_name TEXT NOT NULL,payload TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'queued',progress TEXT NOT NULL DEFAULT '{}',logs TEXT NOT NULL DEFAULT '[]',error TEXT NOT NULL DEFAULT '',report_json TEXT NOT NULL DEFAULT '',files_json TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT)",
		),
		env.DB.prepare(
			"CREATE INDEX IF NOT EXISTS idx_tasks_queue ON tasks(status,created_at)",
		),
		env.DB.prepare(
			"CREATE TABLE IF NOT EXISTS download_tokens (token TEXT PRIMARY KEY,task_id TEXT NOT NULL,object_key TEXT NOT NULL,filename TEXT NOT NULL,content_type TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL)",
		),
	]).catch((error) => {
		schemaReady = null;
		throw error;
	});
	return schemaReady;
}

function normalizeTools(value) {
	const result = [];
	const names = new Set(["get_report"]);
	for (const candidate of Array.isArray(value)
		? value.slice(0, MAX_TOOLS)
		: []) {
		const name = String(candidate?.name || "").trim();
		if (!TOOL_NAME.test(name) || names.has(name)) continue;
		names.add(name);
		const inputSchema =
			candidate?.inputSchema &&
			typeof candidate.inputSchema === "object" &&
			!Array.isArray(candidate.inputSchema)
				? candidate.inputSchema
				: { type: "object" };
		result.push({
			name,
			title: String(candidate.title || name).slice(0, 200),
			description: String(candidate.description || "").slice(0, 2000),
			inputSchema,
			...(candidate.outputSchema && typeof candidate.outputSchema === "object"
				? { outputSchema: candidate.outputSchema }
				: {}),
			scriptId: String(candidate.scriptId || "").slice(0, 160),
			systemTool: candidate.systemTool === true,
		});
	}
	return result;
}

async function holder(env, deviceId) {
	const row = await env.DB.prepare(
		"SELECT device_id,claimed_at FROM mcp_holder WHERE singleton=1",
	).first();
	if (!row?.device_id) return null;
	return {
		holder_device_id: row.device_id,
		claimed_at: row.claimed_at,
		is_holder: row.device_id === deviceId,
	};
}

function relay(env) {
	return env.RELAY.get(env.RELAY.idFromName("owner"));
}
async function notifyExtension(env, message) {
	await relay(env).fetch("https://relay.invalid/notify", {
		method: "POST",
		headers: { "X-SellerFeeds-Relay": "1", "Content-Type": "application/json" },
		body: JSON.stringify(message),
	});
}

export class ExtensionRelay {
	constructor(state) {
		this.state = state;
		// 心跳由运行时直接响应，不唤醒 Durable Object；业务代码只处理真正的通知。
		this.state.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
	}

	async fetch(request) {
		if (request.headers.get("X-SellerFeeds-Relay") !== "1")
			return new Response("forbidden", { status: 403 });
		const url = new URL(request.url);
		if (
			url.pathname === "/connect" &&
			request.headers.get("Upgrade") === "websocket"
		) {
			const pair = new WebSocketPair();
			const client = pair[0];
			const server = pair[1];
			this.state.acceptWebSocket(server, [
				String(request.headers.get("X-Device-Id") || "").slice(0, 100),
			]);
			server.send(JSON.stringify({ type: "relay.ready", version: VERSION }));
			return new Response(null, {
				status: 101,
				webSocket: client,
				headers: { "Sec-WebSocket-Protocol": "sellerfeeds-v1" },
			});
		}
		if (url.pathname === "/notify" && request.method === "POST") {
			const message = await request.text();
			let delivered = 0;
			for (const socket of this.state.getWebSockets()) {
				try {
					socket.send(message);
					delivered += 1;
				} catch (_) {}
			}
			return json({ ok: true, delivered });
		}
		return new Response("not found", { status: 404 });
	}

	webSocketMessage() {}
}

async function handleSocket(request, env, url) {
	if (!sameSecret(socketToken(request), env.OWNER_TOKEN))
		return new Response("unauthorized", { status: 401 });
	const deviceId = String(url.searchParams.get("device_id") || "")
		.trim()
		.slice(0, 100);
	if (!deviceId) return new Response("device_id required", { status: 400 });
	// OWNER_TOKEN 只在 Worker 入口校验，不继续转发给 Durable Object。
	const forwarded = new Request("https://relay.invalid/connect", {
		method: "GET",
		headers: {
			Upgrade: "websocket",
			"Sec-WebSocket-Protocol": "sellerfeeds-v1",
			"X-SellerFeeds-Relay": "1",
			"X-Device-Id": deviceId,
		},
	});
	return relay(env).fetch(forwarded);
}

async function registerExtension(request, env) {
	const body = await readJson(request);
	const deviceId = String(body.device_id || "")
		.trim()
		.slice(0, 100);
	if (!deviceId) return json({ error: "device_id required" }, 400);
	const tools = normalizeTools(body.tools);
	const timestamp = now();
	await env.DB.prepare(
		"INSERT INTO tool_catalog(singleton,device_id,catalog_hash,tools_json,updated_at) VALUES(1,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET device_id=excluded.device_id,catalog_hash=excluded.catalog_hash,tools_json=excluded.tools_json,updated_at=excluded.updated_at",
	)
		.bind(
			deviceId,
			String(body.catalog_hash || "").slice(0, 128),
			JSON.stringify(tools),
			timestamp,
		)
		.run();
	return json({
		ok: true,
		device_id: deviceId,
		catalog_hash: String(body.catalog_hash || ""),
		tool_count: tools.length,
		mcp: await holder(env, deviceId),
	});
}

async function claimExtension(request, env) {
	const body = await readJson(request, 65536);
	const deviceId = String(body.device_id || "")
		.trim()
		.slice(0, 100);
	if (!deviceId) return json({ error: "device_id required" }, 400);
	const timestamp = now();
	const previous = await env.DB.prepare(
		"SELECT device_id FROM mcp_holder WHERE singleton=1",
	).first();
	await env.DB.prepare(
		"INSERT INTO mcp_holder(singleton,device_id,claimed_at,last_seen) VALUES(1,?,?,?) ON CONFLICT(singleton) DO UPDATE SET device_id=excluded.device_id,claimed_at=excluded.claimed_at,last_seen=excluded.last_seen",
	)
		.bind(deviceId, timestamp, timestamp)
		.run();
	return json({
		ok: true,
		mcp: {
			holder_device_id: deviceId,
			claimed_at: timestamp,
			is_holder: true,
			previous_holder_device_id:
				previous?.device_id && previous.device_id !== deviceId
					? previous.device_id
					: null,
		},
	});
}

async function pollExtension(request, env) {
	const body = await readJson(request, 65536);
	const deviceId = String(body.device_id || "")
		.trim()
		.slice(0, 100);
	if (!deviceId) return json({ error: "device_id required" }, 400);
	const currentHolder = await holder(env, deviceId);
	if (currentHolder?.holder_device_id && !currentHolder.is_holder)
		return json({ ok: true, task: null, mcp: currentHolder });
	const catalog = await env.DB.prepare(
		"SELECT catalog_hash FROM tool_catalog WHERE singleton=1 AND device_id=?",
	)
		.bind(deviceId)
		.first();
	if (body.catalog_hash && catalog?.catalog_hash !== body.catalog_hash)
		return json({
			ok: true,
			task: null,
			catalog_missing: true,
			mcp: currentHolder,
		});
	const task = await env.DB.prepare(
		"SELECT * FROM tasks WHERE status='queued' AND (device_id='' OR device_id=?) ORDER BY created_at LIMIT 1",
	)
		.bind(deviceId)
		.first();
	if (!task) return json({ ok: true, task: null, mcp: currentHolder });
	const claimed = await env.DB.prepare(
		"UPDATE tasks SET status='claimed',device_id=?,updated_at=? WHERE id=? AND status='queued'",
	)
		.bind(deviceId, now(), task.id)
		.run();
	if (!(claimed.meta?.changes > 0))
		return json({ ok: true, task: null, mcp: currentHolder });
	return json({
		ok: true,
		task: { task_id: task.id, ...JSON.parse(task.payload || "{}") },
		mcp: currentHolder,
	});
}

async function updateProgress(request, env) {
	const body = await readJson(request, 131072);
	if (body.status === "completed")
		return json({ error: "completed status must use report endpoint" }, 400);
	const status = ["claimed", "running", "failed"].includes(body.status)
		? body.status
		: "running";
	const result = await env.DB.prepare(
		"UPDATE tasks SET status=?,progress=?,logs=?,error=?,updated_at=? WHERE id=? AND (device_id=? OR device_id='')",
	)
		.bind(
			status,
			JSON.stringify(body.progress || {}).slice(0, 8000),
			JSON.stringify(
				Array.isArray(body.logs) ? body.logs.slice(-80) : [],
			).slice(0, 20000),
			String(body.error || "").slice(0, 1000),
			now(),
			String(body.task_id || ""),
			String(body.device_id || ""),
		)
		.run();
	return result.meta?.changes > 0
		? json({ ok: true })
		: json({ error: "task not found" }, 404);
}

function fileContentType(format) {
	if (format === "md") return "text/markdown; charset=utf-8";
	if (format === "csv") return "text/csv; charset=utf-8";
	if (format === "jsonl") return "application/x-ndjson; charset=utf-8";
	if (format === "xlsx")
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
	return "application/json; charset=utf-8";
}

async function saveReport(request, env, url) {
	const body = await readJson(request, 36 * 1024 * 1024);
	const taskId = String(body.task_id || "").trim();
	const task = await env.DB.prepare("SELECT id,device_id FROM tasks WHERE id=?")
		.bind(taskId)
		.first();
	if (
		!task ||
		(task.device_id && task.device_id !== String(body.device_id || ""))
	)
		return json({ error: "task not found" }, 404);
	const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
	const links = [];
	for (const file of Array.isArray(body.files) ? body.files.slice(0, 4) : []) {
		const format = String(file.format || "").toLowerCase();
		if (
			!["md", "csv", "xlsx", "json", "jsonl"].includes(format) ||
			!file.data_b64
		)
			continue;
		let bytes;
		try {
			bytes = Uint8Array.from(atob(file.data_b64), (character) =>
				character.charCodeAt(0),
			);
		} catch (_) {
			continue;
		}
		if (!bytes.length || bytes.byteLength > 25 * 1024 * 1024) continue;
		const objectKey = `reports/${taskId}/${crypto.randomUUID()}.${format}`;
		const filename = String(file.filename || `${taskId}.${format}`)
			.replace(/[^a-zA-Z0-9_.-]/g, "_")
			.slice(0, 120);
		const token =
			crypto.randomUUID().replace(/-/g, "") +
			crypto.randomUUID().replace(/-/g, "");
		const contentType = fileContentType(format);
		await env.REPORTS.put(objectKey, bytes, { httpMetadata: { contentType } });
		await env.DB.prepare(
			"INSERT INTO download_tokens(token,task_id,object_key,filename,content_type,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
		)
			.bind(token, taskId, objectKey, filename, contentType, expiresAt, now())
			.run();
		links.push({
			format,
			label: `下载 ${format.toUpperCase()}`,
			url: `${url.origin}/downloads/${token}/${encodeURIComponent(filename)}`,
			expires_at: expiresAt,
		});
	}
	const status = body.status === "failed" ? "failed" : "completed";
	const report =
		body.public_report && typeof body.public_report === "object"
			? body.public_report
			: body.report || {};
	await env.DB.prepare(
		"UPDATE tasks SET status=?,progress=?,logs=?,error=?,report_json=?,files_json=?,updated_at=?,completed_at=? WHERE id=?",
	)
		.bind(
			status,
			JSON.stringify(body.progress || {}).slice(0, 8000),
			JSON.stringify(body.logs || []).slice(0, 20000),
			String(body.error || "").slice(0, 1000),
			JSON.stringify(report),
			JSON.stringify(links),
			now(),
			now(),
			taskId,
		)
		.run();
	return json({ ok: true, task_id: taskId, status, files: links });
}

function taskResult(task) {
	let report = null;
	let files = [];
	let progress = {};
	let logs = [];
	try {
		report = task.report_json ? JSON.parse(task.report_json) : null;
	} catch (_) {}
	try {
		files = JSON.parse(task.files_json || "[]");
	} catch (_) {}
	try {
		progress = JSON.parse(task.progress || "{}");
	} catch (_) {}
	try {
		logs = JSON.parse(task.logs || "[]");
	} catch (_) {}
	return {
		task_id: task.id,
		status: task.status,
		progress,
		logs,
		error: task.error || "",
		ready: Boolean(report),
		report,
		files,
		report_expired: false,
	};
}

async function mcpEndpoint(request, env) {
	const body = await readJson(request, 262144);
	if (body.jsonrpc !== "2.0")
		return json(
			rpc(body?.id ?? null, null, {
				code: -32600,
				message: "Invalid JSON-RPC request",
			}),
			400,
		);
	const id = body.id ?? null;
	const method = String(body.method || "");
	const params =
		body.params && typeof body.params === "object" ? body.params : {};
	if (method === "initialize") {
		const requested = String(params.protocolVersion || "");
		const protocolVersion = ["2024-11-05", "2025-03-26"].includes(requested)
			? requested
			: "2025-03-26";
		return json(
			rpc(id, {
				protocolVersion,
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: "插件精灵个人 Cloudflare MCP", version: VERSION },
			}),
			200,
			{ "MCP-Protocol-Version": protocolVersion },
		);
	}
	if (method === "notifications/initialized")
		return new Response(null, { status: 202, headers: CORS });
	if (method === "ping") return json(rpc(id, {}));
	if (method === "tools/list") {
		const row = await env.DB.prepare(
			"SELECT tools_json FROM tool_catalog WHERE singleton=1",
		).first();
		let tools = [];
		try {
			tools = normalizeTools(JSON.parse(row?.tools_json || "[]")).map(
				({ scriptId: _scriptId, systemTool: _systemTool, ...tool }) => tool,
			);
		} catch (_) {}
		tools.push({
			name: "get_report",
			title: "查询任务报告",
			description: "查询个人 Cloudflare MCP 异步任务的状态、日志和结构化报告。",
			inputSchema: {
				type: "object",
				required: ["task_id"],
				properties: { task_id: { type: "string" } },
			},
		});
		return json(rpc(id, { tools }));
	}
	if (method !== "tools/call")
		return json(rpc(id, null, { code: -32601, message: "Method not found" }));
	const name = String(params.name || "");
	const args =
		params.arguments && typeof params.arguments === "object"
			? params.arguments
			: {};
	if (name === "get_report") {
		const task = await env.DB.prepare("SELECT * FROM tasks WHERE id=?")
			.bind(String(args.task_id || ""))
			.first();
		if (!task)
			return json(rpc(id, null, { code: -32602, message: "task not found" }));
		const result = taskResult(task);
		return json(
			rpc(id, {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				structuredContent: result,
			}),
		);
	}
	const row = await env.DB.prepare(
		"SELECT device_id,tools_json FROM tool_catalog WHERE singleton=1",
	).first();
	let selected = null;
	try {
		selected = normalizeTools(JSON.parse(row?.tools_json || "[]")).find(
			(tool) => tool.name === name,
		);
	} catch (_) {}
	if (!selected)
		return json(
			rpc(id, null, {
				code: -32602,
				message: "Tool 当前不可用，请先打开插件并同步 Tool 清单",
			}),
		);
	const taskId = `ext_${Date.now()}_${crypto.randomUUID().slice(0, 12)}`;
	const timestamp = now();
	const payload = {
		task_type: selected.systemTool ? "system_data_tool" : "user_script_tool",
		source: "mcp",
		mcp_tool_name: name,
		script_id: selected.scriptId,
		input: args,
	};
	await env.DB.prepare(
		"INSERT INTO tasks(id,device_id,tool_name,payload,status,progress,logs,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
	)
		.bind(
			taskId,
			String(row?.device_id || ""),
			name,
			JSON.stringify(payload),
			"queued",
			JSON.stringify({ success: 0, failed: 0, total: 1 }),
			JSON.stringify([`Tool ${name} 已创建，等待浏览器脚本执行。`]),
			timestamp,
			timestamp,
		)
		.run();
	await notifyExtension(env, { type: "task.available", taskId }).catch(
		() => {},
	);
	const queued = {
		task_id: taskId,
		status: "queued",
		tool: name,
		message: "任务已创建，请使用 get_report 查询状态。",
	};
	return json(
		rpc(id, {
			content: [{ type: "text", text: JSON.stringify(queued) }],
			structuredContent: queued,
		}),
	);
}

async function download(request, env, url) {
	const parts = url.pathname.split("/").filter(Boolean);
	const token = String(parts[1] || "");
	const row = await env.DB.prepare(
		"SELECT * FROM download_tokens WHERE token=? AND expires_at>?",
	)
		.bind(token, now())
		.first();
	if (!row) return new Response("not found", { status: 404 });
	const object = await env.REPORTS.get(row.object_key);
	if (!object) return new Response("not found", { status: 404 });
	return new Response(object.body, {
		headers: {
			"Content-Type": row.content_type,
			"Content-Disposition": `attachment; filename="${row.filename}"`,
			"Cache-Control": "private, no-store",
		},
	});
}

async function cleanup(env) {
	await ensureSchema(env);
	const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
	const files = await env.DB.prepare(
		"SELECT object_key FROM download_tokens WHERE expires_at<=? LIMIT 100",
	)
		.bind(now())
		.all();
	for (const row of files.results || [])
		await env.REPORTS.delete(row.object_key).catch(() => {});
	await env.DB.batch([
		env.DB.prepare("DELETE FROM download_tokens WHERE expires_at<=?").bind(
			now(),
		),
		env.DB.prepare(
			"DELETE FROM tasks WHERE completed_at IS NOT NULL AND completed_at<=?",
		).bind(cutoff),
	]);
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (request.method === "OPTIONS")
			return new Response(null, { status: 204, headers: CORS });
		if (url.pathname === "/" && request.method === "GET")
			return new Response(INTRODUCTION, {
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "public, max-age=300",
				},
			});
		if (
			url.pathname === "/api/extension/socket" &&
			request.headers.get("Upgrade") === "websocket"
		)
			return handleSocket(request, env, url);
		if (url.pathname.startsWith("/downloads/")) {
			await ensureSchema(env);
			return download(request, env, url);
		}
		if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
		await ensureSchema(env);
		try {
			if (url.pathname === "/health" && request.method === "GET")
				return json({
					ok: true,
					service: "sellerfeeds-personal-mcp",
					version: VERSION,
					transport: "streamable-http",
					taskDelivery: "websocket",
				});
			if (url.pathname === "/mcp" && request.method === "POST")
				return mcpEndpoint(request, env);
			if (
				url.pathname === "/api/extension/register" &&
				request.method === "POST"
			)
				return registerExtension(request, env);
			if (
				url.pathname === "/api/extension/mcp/claim" &&
				request.method === "POST"
			)
				return claimExtension(request, env);
			if (url.pathname === "/api/extension/poll" && request.method === "POST")
				return pollExtension(request, env);
			if (
				url.pathname === "/api/extension/progress" &&
				request.method === "POST"
			)
				return updateProgress(request, env);
			if (url.pathname === "/api/extension/report" && request.method === "POST")
				return saveReport(request, env, url);
			return json({ error: "not found" }, 404);
		} catch (error) {
			return json(
				{
					error: error?.status
						? String(error.message || error)
						: "request failed",
				},
				Number(error?.status || 500),
			);
		}
	},
	async scheduled(_event, env, context) {
		context.waitUntil(cleanup(env));
	},
};

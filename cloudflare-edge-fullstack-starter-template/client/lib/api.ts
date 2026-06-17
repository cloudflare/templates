// Tiny typed fetch client. Auth hits better-auth's endpoints directly; notes
// and files hit our own routes. Same-origin, so cookies flow automatically —
// `credentials: 'include'` is belt-and-braces.

export class ApiError extends Error {
	code?: string;
	status: number;
	constructor(message: string, status: number, code?: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
	}
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, { credentials: "include", ...init });
	const text = await res.text();
	const body = text ? safeJson(text) : null;
	if (!res.ok) {
		const msg =
			(body && (body.message || body.error?.message || body.error)) ||
			`Request failed (${res.status})`;
		throw new ApiError(
			typeof msg === "string" ? msg : "Request failed",
			res.status,
			body?.code,
		);
	}
	return body as T;
}

function safeJson(s: string): any {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

function jsonInit(method: string, data: unknown): RequestInit {
	return {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(data),
	};
}

// ---- auth ----

export type User = { id: string; email: string; name: string | null };

export const auth = {
	signUp: (name: string, email: string, password: string) =>
		req<{ user: User }>(
			"/api/auth/sign-up/email",
			jsonInit("POST", { name, email, password }),
		),
	signIn: (email: string, password: string) =>
		req<{ user: User }>(
			"/api/auth/sign-in/email",
			jsonInit("POST", { email, password }),
		),
	signOut: () => req<unknown>("/api/auth/sign-out", { method: "POST" }),
	async getUser(): Promise<User | null> {
		// better-auth returns the { session, user } pair, or an empty/null body
		// when signed out.
		const res = await fetch("/api/auth/get-session", {
			credentials: "include",
		});
		if (!res.ok) return null;
		const text = await res.text();
		const body = text ? safeJson(text) : null;
		const u = body?.user;
		return u ? { id: u.id, email: u.email, name: u.name ?? null } : null;
	},
};

// ---- notes ----

export type Note = {
	id: string;
	content: string;
	attachmentKey: string | null;
	attachmentName: string | null;
	createdAt: number;
};

export const notes = {
	list: () => req<{ notes: Note[] }>("/api/notes").then((r) => r.notes),
	create: (content: string, attachmentKey?: string, attachmentName?: string) =>
		req<{ note: Note }>(
			"/api/notes",
			jsonInit("POST", { content, attachmentKey, attachmentName }),
		).then((r) => r.note),
	remove: (id: string) =>
		req<unknown>(`/api/notes/${id}`, { method: "DELETE" }),
};

// ---- files (R2) ----

export const files = {
	async upload(file: File): Promise<{ key: string; name: string }> {
		return req<{ key: string; name: string }>("/api/files", {
			method: "POST",
			headers: {
				"content-type": file.type || "application/octet-stream",
				"x-filename": encodeURIComponent(file.name),
			},
			body: file,
		});
	},
	downloadUrl: (key: string) => `/api/files?key=${encodeURIComponent(key)}`,
};

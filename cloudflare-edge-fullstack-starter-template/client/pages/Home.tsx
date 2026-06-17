import { useEffect, useRef, useState } from "react";
import {
	notes as notesApi,
	files,
	auth,
	type Note,
	ApiError,
} from "../lib/api.ts";
import { useSession, refreshSession } from "../lib/session.ts";
import { ProductFooter } from "./ProductFooter.tsx";

export function Home() {
	const session = useSession();
	const [notes, setNotes] = useState<Note[]>([]);
	const [loading, setLoading] = useState(true);
	const [content, setContent] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		notesApi
			.list()
			.then(setNotes)
			.catch(() => setError("Could not load notes"))
			.finally(() => setLoading(false));
	}, []);

	async function addNote(e: React.FormEvent) {
		e.preventDefault();
		if (!content.trim() && !file) return;
		setBusy(true);
		setError(null);
		try {
			let key: string | undefined;
			let name: string | undefined;
			if (file) {
				const up = await files.upload(file);
				key = up.key;
				name = file.name;
			}
			const note = await notesApi.create(
				content.trim() || "(attachment)",
				key,
				name,
			);
			setNotes((prev) => [note, ...prev]);
			setContent("");
			setFile(null);
			if (fileInput.current) fileInput.current.value = "";
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not save note");
		} finally {
			setBusy(false);
		}
	}

	async function removeNote(id: string) {
		setNotes((prev) => prev.filter((n) => n.id !== id));
		await notesApi.remove(id).catch(() => setError("Could not delete note"));
	}

	async function signOut() {
		await auth.signOut().catch(() => {});
		await refreshSession();
	}

	const userName =
		session.status === "signed-in"
			? session.user.name || session.user.email
			: "";

	return (
		<div className="flex min-h-screen flex-col">
			<header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3">
				<div className="text-sm font-semibold uppercase tracking-wide text-orange-600">
					Edge Full-Stack Starter
				</div>
				<div className="flex items-center gap-3 text-sm text-stone-500">
					<span className="hidden sm:inline">{userName}</span>
					<button onClick={signOut} className="btn-ghost">
						Sign out
					</button>
				</div>
			</header>

			<main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
				<CostPatternStrip />

				<form
					onSubmit={addNote}
					className="mb-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
				>
					<textarea
						value={content}
						onChange={(e) => setContent(e.target.value)}
						placeholder="Write a note…"
						rows={3}
						className="input resize-none"
					/>
					<div className="mt-3 flex items-center justify-between gap-3">
						<label className="cursor-pointer text-sm text-stone-500 hover:text-stone-700">
							<input
								ref={fileInput}
								type="file"
								className="hidden"
								onChange={(e) => setFile(e.target.files?.[0] ?? null)}
							/>
							{file ? `📎 ${file.name}` : "📎 Attach a file"}
						</label>
						<button type="submit" disabled={busy} className="btn-primary">
							{busy ? "Saving…" : "Add note"}
						</button>
					</div>
				</form>

				{error && <p className="mb-4 text-sm text-red-600">{error}</p>}

				{loading ? (
					<p className="text-stone-400">Loading…</p>
				) : notes.length === 0 ? (
					<p className="text-center text-stone-400">
						No notes yet. Write your first one above.
					</p>
				) : (
					<ul className="space-y-3">
						{notes.map((n) => (
							<li
								key={n.id}
								className="group rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
							>
								<div className="flex items-start justify-between gap-3">
									<p className="whitespace-pre-wrap break-words text-stone-800">
										{n.content}
									</p>
									<button
										onClick={() => removeNote(n.id)}
										className="shrink-0 text-stone-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
										aria-label="Delete note"
									>
										✕
									</button>
								</div>
								{n.attachmentKey && (
									<a
										href={files.downloadUrl(n.attachmentKey)}
										target="_blank"
										rel="noreferrer"
										className="mt-2 inline-flex items-center gap-1 text-sm text-orange-600 hover:underline"
									>
										📎 {n.attachmentName ?? "attachment"}
									</a>
								)}
								<div className="mt-2 text-xs text-stone-400">
									{new Date(n.createdAt).toLocaleString()}
								</div>
							</li>
						))}
					</ul>
				)}
			</main>

			<ProductFooter />
		</div>
	);
}

// A small, honest explainer of the three cost choices the template bakes in.
// This is the "differentiator made visible" — the reason the template exists.
function CostPatternStrip() {
	return (
		<div className="mb-8 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-stone-600">
			<p className="mb-2 font-medium text-stone-800">Wired the cheap way:</p>
			<ul className="space-y-1">
				<li>
					<span className="font-medium text-orange-700">Sessions → KV</span> —
					auth checks are edge reads, not billed D1 row reads.
				</li>
				<li>
					<span className="font-medium text-orange-700">Data → D1</span> — your
					notes and the auth tables share one SQLite database.
				</li>
				<li>
					<span className="font-medium text-orange-700">Files → R2</span> —
					object storage with no egress fees.
				</li>
			</ul>
		</div>
	);
}

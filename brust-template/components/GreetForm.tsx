// A form that calls POST /greet through the typed client. brust builds it as a React island.
import { useState } from "react";
import { api } from "../lib/api";

export default function GreetForm() {
	const [name, setName] = useState("");
	const [sending, setSending] = useState(false);
	const [message, setMessage] = useState("");
	const [at, setAt] = useState("");
	const [error, setError] = useState("");
	const submit = async (e: { preventDefault(): void }) => {
		e.preventDefault();
		setSending(true);
		setError("");
		const r = await api.greet.post({ name });
		setSending(false);
		if (r.error) {
			setMessage("");
			setError(
				r.error.status === 422
					? "Type a name (1–40 characters)."
					: `Failed with status ${r.error.status}`,
			);
		} else {
			setMessage(r.data.message);
			setAt(new Date(r.data.at).toLocaleTimeString());
		}
	};
	return (
		<form className="grid gap-4" onSubmit={submit}>
			<label className="font-semibold" htmlFor="greet-name">
				Your name
			</label>
			<div className="flex flex-wrap gap-3">
				<input
					id="greet-name"
					name="name"
					className="min-w-0 flex-1 basis-48 rounded-[0.6rem] border border-rule bg-paper px-3 py-2 text-ink placeholder:text-ink-2/60 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-amber"
					maxLength={40}
					placeholder="e.g. Ada"
					autoComplete="off"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<button
					type="submit"
					className="cursor-pointer rounded-[0.6rem] border border-amber-ink bg-amber px-[1.1rem] py-2 font-semibold text-[oklch(18%_0.035_82)] hover:brightness-106 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-amber-ink disabled:cursor-wait disabled:opacity-60"
					disabled={sending}
				>
					{sending ? "Sending…" : "Say hello"}
				</button>
			</div>
			{message ? (
				<div
					className="rounded-[0.6rem] border border-rule bg-paper px-4 py-3"
					aria-live="polite"
				>
					<p className="m-0 text-xl font-bold">{message}</p>
					<p className="mt-1 mb-0 text-[0.9375rem] text-ink-2">
						answered by the Worker at {at}
					</p>
				</div>
			) : null}
			{error ? (
				<p className="m-0 font-semibold text-amber-ink" role="alert">
					{error}
				</p>
			) : null}
		</form>
	);
}

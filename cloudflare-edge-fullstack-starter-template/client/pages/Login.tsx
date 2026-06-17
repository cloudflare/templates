import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { auth, ApiError } from "../lib/api.ts";
import { refreshSession } from "../lib/session.ts";
import { AuthShell } from "./AuthShell.tsx";

export function Login() {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setBusy(true);
		try {
			await auth.signIn(email, password);
			await refreshSession();
			navigate("/", { replace: true });
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Sign-in failed");
			setBusy(false);
		}
	}

	return (
		<AuthShell title="Sign in" subtitle="Welcome back.">
			<form onSubmit={onSubmit} className="space-y-4">
				<Field label="Email">
					<input
						type="email"
						required
						autoComplete="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="input"
					/>
				</Field>
				<Field label="Password">
					<input
						type="password"
						required
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="input"
					/>
				</Field>
				{error && <p className="text-sm text-red-600">{error}</p>}
				<button type="submit" disabled={busy} className="btn-primary w-full">
					{busy ? "Signing in…" : "Sign in"}
				</button>
			</form>
			<p className="mt-6 text-center text-sm text-stone-500">
				No account?{" "}
				<Link
					to="/signup"
					className="font-medium text-orange-600 hover:underline"
				>
					Create one
				</Link>
			</p>
		</AuthShell>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<label className="block">
			<span className="mb-1 block text-sm font-medium text-stone-700">
				{label}
			</span>
			{children}
		</label>
	);
}

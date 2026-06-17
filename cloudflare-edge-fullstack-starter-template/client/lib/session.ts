// useSession() — current-user state shared across the React tree via a single
// in-memory cache + subscription, so components don't each fire their own
// /api/auth/get-session request.

import { useEffect, useState } from "react";
import { auth, type User } from "./api.ts";

type SessionState =
	| { status: "loading" }
	| { status: "signed-in"; user: User }
	| { status: "signed-out" };

let cache: SessionState = { status: "loading" };
const subscribers = new Set<(s: SessionState) => void>();

function set(next: SessionState) {
	cache = next;
	for (const s of subscribers) s(next);
}

let loading: Promise<void> | null = null;
async function loadOnce() {
	if (loading) return loading;
	loading = (async () => {
		try {
			const user = await auth.getUser();
			set(user ? { status: "signed-in", user } : { status: "signed-out" });
		} catch {
			set({ status: "signed-out" });
		}
	})();
	await loading;
}

/** Refresh after sign-in / sign-up / sign-out. Await before navigating so the
 *  cache reflects the new state before route guards re-run. */
export function refreshSession(): Promise<void> {
	loading = null;
	return loadOnce();
}

export function useSession(): SessionState {
	const [state, setState] = useState<SessionState>(cache);
	useEffect(() => {
		subscribers.add(setState);
		void loadOnce();
		return () => {
			subscribers.delete(setState);
		};
	}, []);
	return state;
}

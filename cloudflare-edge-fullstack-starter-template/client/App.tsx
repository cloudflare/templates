import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { useSession } from "./lib/session.ts";
import { Login } from "./pages/Login.tsx";
import { Signup } from "./pages/Signup.tsx";
import { Home } from "./pages/Home.tsx";

function RequireAuth({ children }: { children: React.ReactNode }) {
	const session = useSession();
	if (session.status === "loading") return <Splash />;
	if (session.status === "signed-out") return <Navigate to="/login" replace />;
	return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
	const session = useSession();
	if (session.status === "loading") return <Splash />;
	if (session.status === "signed-in") return <Navigate to="/" replace />;
	return <>{children}</>;
}

function Splash() {
	return (
		<div className="grid min-h-screen place-items-center text-stone-400">
			<span className="animate-pulse">Loading…</span>
		</div>
	);
}

export function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route
					path="/login"
					element={
						<RedirectIfAuthed>
							<Login />
						</RedirectIfAuthed>
					}
				/>
				<Route
					path="/signup"
					element={
						<RedirectIfAuthed>
							<Signup />
						</RedirectIfAuthed>
					}
				/>
				<Route
					path="/"
					element={
						<RequireAuth>
							<Home />
						</RequireAuth>
					}
				/>
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</BrowserRouter>
	);
}

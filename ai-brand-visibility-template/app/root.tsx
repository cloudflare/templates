import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>AI Brand Visibility Template</title>
				<link rel="icon" type="image/x-icon" href="/favicon.ico" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	return (
		<main className="pt-16 p-4 max-w-2xl mx-auto">
			<h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
			<p className="text-neutral-500">
				{error instanceof Error
					? error.message
					: "An unexpected error occurred."}
			</p>
		</main>
	);
}

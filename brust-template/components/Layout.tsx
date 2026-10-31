// The document root: a plain <html> with <Outlet/> for the page. app.css (Tailwind CSS v4) is imported here; brust
// builds it into one hashed file and links it in <head>. Static files are served from /public.
// A link click swaps the page in place (brust SPA navigation); layoutLoader hands the path to the top bar.
import { type LoaderCtx, Outlet } from "@brust/core/routes";
import "../app.css";
import DeployButton from "./DeployButton";
import Logo from "./Logo";

const navLink =
	"rounded px-1 font-semibold text-ink-2 no-underline hover:text-ink aria-[current=page]:text-amber-ink aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-[0.35em] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-amber-ink";

export function layoutLoader({ path }: LoaderCtx) {
	return { path };
}

export default function Layout({ path }: { path: string }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>brust app</title>
				<link rel="icon" href="/public/favicon.svg" />
			</head>
			<body className="bg-paper font-sans text-ink leading-[1.55]">
				<div className="mx-auto box-border max-w-2xl px-4">
					<header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule py-4">
						<a
							className="flex items-center gap-2 rounded font-bold text-ink no-underline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-amber-ink"
							href="/"
						>
							<Logo size={28} />
							brust app
						</a>
						<nav className="flex gap-4" aria-label="Main">
							<a
								className={navLink}
								href="/"
								aria-current={path === "/" ? "page" : undefined}
							>
								Home
							</a>
							<a
								className={navLink}
								href="/actions"
								aria-current={path === "/actions" ? "page" : undefined}
							>
								Actions
							</a>
						</nav>
					</header>
					<main className="py-12">
						<Outlet />
					</main>
					<footer className="flex flex-wrap items-center justify-between gap-4 border-t border-rule py-6 text-[0.9375rem] text-ink-2">
						<span>Served by a Cloudflare Worker.</span>
						<DeployButton />
					</footer>
				</div>
			</body>
		</html>
	);
}

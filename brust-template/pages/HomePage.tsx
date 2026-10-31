import Counter from "../components/Counter";
import Logo from "../components/Logo";

const link =
	"font-semibold text-amber-ink underline underline-offset-[0.2em] hover:decoration-2 focus-visible:rounded focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-amber-ink";

export default function HomePage() {
	return (
		<>
			<header className="flex items-center gap-[0.9rem]">
				<Logo size={44} />
				<h1 className="m-0 text-4xl leading-[1.1] font-bold tracking-[-0.01em]">
					brust app
				</h1>
			</header>
			<p className="mt-4 mb-8 text-lg text-ink-2">
				Edit pages/HomePage.tsx and save. The page reloads.
			</p>
			<section className="rounded-2xl border border-rule bg-sheet p-6">
				<Counter />
				<p className="mt-4 mb-0 text-[0.9375rem] text-ink-2">
					useState only, so this button is native: a signal in the browser, no
					React shipped.
				</p>
			</section>
			<p className="mt-6 mb-0 text-ink-2">
				Next: send a form to a typed action on the{" "}
				<a className={link} href="/actions">
					Actions page
				</a>
				.
			</p>
			<nav
				className="mt-8 flex flex-wrap gap-x-6 gap-y-2"
				aria-label="Learn more"
			>
				<a className={link} href="https://brust.dev">
					Docs
				</a>
				<a className={link} href="https://brust.dev/docs/routing">
					Routes
				</a>
				<a className={link} href="https://brust.dev/docs/actions">
					Actions docs
				</a>
			</nav>
		</>
	);
}

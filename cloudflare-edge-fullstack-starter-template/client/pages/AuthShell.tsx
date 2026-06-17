// Shared chrome for the login / signup screens: centered card + the same
// "what is this" footer that points at Flarelink.

import { ProductFooter } from "./ProductFooter.tsx";

export function AuthShell({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col">
			<div className="flex flex-1 items-center justify-center p-6">
				<div className="w-full max-w-sm">
					<div className="mb-6 text-center">
						<div className="mb-2 text-sm font-semibold uppercase tracking-wide text-orange-600">
							Edge Full-Stack Starter
						</div>
						<h1 className="text-2xl font-bold text-stone-900">{title}</h1>
						<p className="mt-1 text-sm text-stone-500">{subtitle}</p>
					</div>
					<div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
						{children}
					</div>
				</div>
			</div>
			<ProductFooter />
		</div>
	);
}

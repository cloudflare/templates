import { Globe } from "@phosphor-icons/react";

export function NoSiteSelected() {
	return (
		<div className="flex items-center justify-center h-[60vh]">
			<div className="text-center max-w-sm">
				<div className="mx-auto w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
					<Globe size={20} className="text-neutral-400" />
				</div>
				<h2 className="text-lg font-semibold text-neutral-900 mb-1">
					No site selected
				</h2>
				<p className="text-sm text-neutral-500 mb-5">
					Add a site to start testing AI visibility across models.
				</p>
				<a
					href="/setup"
					className="inline-flex items-center gap-1.5 h-9 px-4 text-[13px] font-medium rounded-lg bg-brand text-white hover:bg-brand-hover shadow-xs ring-1 ring-brand transition-all"
				>
					Add your first site
				</a>
			</div>
		</div>
	);
}

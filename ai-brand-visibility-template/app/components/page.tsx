import type { ReactNode } from "react";

/** Page header matching stratus ProductOverviewBeta */
export function PageHeader({
	title,
	subtitle,
	actions,
	children,
}: {
	title: string;
	subtitle?: string;
	actions?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="max-w-[1400px] mx-auto w-full px-6 lg:px-10 pt-8 lg:pt-10">
			<h1 className="text-[22px] font-bold text-neutral-950 mb-0.5">{title}</h1>
			{subtitle && (
				<p className="text-[13px] text-neutral-500 mb-4">{subtitle}</p>
			)}
			{actions && <div className="flex items-center gap-2 mb-6">{actions}</div>}
			{children}
		</div>
	);
}

/** Page body — content area below header */
export function PageBody({ children }: { children: ReactNode }) {
	return (
		<div className="max-w-[1400px] mx-auto w-full px-6 lg:px-10 pb-10 flex flex-col gap-4">
			{children}
		</div>
	);
}

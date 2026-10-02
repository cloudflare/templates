import type { ReactNode } from "react";

/** Kumo LayerCard — exact stratus pattern: ring + shadow-xs + rounded-lg */
export function Card({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={`w-full text-base ring ring-neutral-950/10 rounded-lg shadow-xs bg-surface overflow-hidden ${className}`}
		>
			{children}
		</div>
	);
}

/** LayerCard.Header — px-4 py-2.5 font-medium text-neutral-500 */
export function CardHeader({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={`px-4 py-2.5 font-medium text-neutral-500 flex items-center text-base ${className}`}
		>
			{children}
		</div>
	);
}

/** LayerCard.Title with action area — matches stratus PathsTable header */
export function CardTitle({
	title,
	description,
	actions,
	className = "",
}: {
	title: string;
	description?: string;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={`px-4 py-2.5 flex items-center text-base relative ${className}`}
		>
			<div className="flex flex-col gap-1 relative">
				<div
					role="heading"
					aria-level={2}
					className="text-[17px]/[1.25] font-medium text-neutral-900 flex items-center gap-1"
				>
					{title}
				</div>
				{description && (
					<div className="text-sm text-neutral-500">{description}</div>
				)}
			</div>
			{actions && (
				<span className="ml-auto flex items-center gap-2 shrink-0">
					{actions}
				</span>
			)}
		</div>
	);
}

/** LayerCard.Content — p-4 by default, flush for tables */
export function CardBody({
	children,
	flush = false,
	className = "",
}: {
	children: ReactNode;
	flush?: boolean;
	className?: string;
}) {
	return (
		<div className={`${flush ? "p-0 overflow-hidden" : "p-4"} ${className}`}>
			{children}
		</div>
	);
}

import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

/** Kumo-style data table matching stratus ResponsiveTableWrapper */
export function Table({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<table className={`w-full border-collapse text-[13px] ${className}`}>
			{children}
		</table>
	);
}

export function Thead({ children }: { children: ReactNode }) {
	return <thead className="bg-surface">{children}</thead>;
}

export function Th({
	children,
	className = "",
	...props
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
	return (
		<th
			className={`text-left px-4 py-2 font-medium text-[11px] uppercase tracking-[0.03em] text-neutral-500 border-b border-neutral-200 ${className}`}
			{...props}
		>
			{children}
		</th>
	);
}

export function Td({
	children,
	className = "",
	...props
}: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
	return (
		<td
			className={`px-4 h-[46px] align-middle border-b border-neutral-100 ${className}`}
			{...props}
		>
			{children}
		</td>
	);
}

export function Tr({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<tr className={`hover:bg-surface-secondary transition-colors ${className}`}>
			{children}
		</tr>
	);
}

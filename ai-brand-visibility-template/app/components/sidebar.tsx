import { NavLink } from "react-router";
import type { ReactNode } from "react";

export function Sidebar({ children }: { children: ReactNode }) {
	return (
		<aside className="w-[240px] bg-surface border-r border-neutral-200 shrink-0 sticky top-[58px] h-[calc(100vh-58px)] overflow-y-auto p-2 flex flex-col gap-0.5 max-lg:hidden">
			{children}
		</aside>
	);
}

export function SidebarSection({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div>
			<div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500 px-3 pt-4 pb-1">
				{label}
			</div>
			{children}
		</div>
	);
}

export function SidebarNav({ children }: { children: ReactNode }) {
	return <nav className="flex flex-col gap-0.5">{children}</nav>;
}

export function SidebarNavItem({
	to,
	icon,
	children,
}: {
	to: string;
	icon: ReactNode;
	children: ReactNode;
}) {
	return (
		<NavLink
			to={to}
			end={to === "/"}
			className={({ isActive }) =>
				`flex items-center gap-2.5 px-3 min-h-[34px] rounded-lg text-[13px] transition-all ${
					isActive
						? "bg-neutral-100 text-neutral-950 font-medium [&_svg]:opacity-85"
						: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 [&_svg]:opacity-55"
				}`
			}
		>
			{icon}
			{children}
		</NavLink>
	);
}

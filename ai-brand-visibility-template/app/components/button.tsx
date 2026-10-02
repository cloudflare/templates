import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

/**
 * Exact stratus Kumo Button:
 * - primary: bg-kumo-brand (#046cfe), white text, ring-primary
 * - secondary: bg-surface, ring, neutral text
 * - ghost: transparent, hover ring
 */
const variants: Record<Variant, string> = {
	primary:
		"bg-brand text-white shadow-xs ring-1 ring-brand hover:bg-brand-hover hover:ring-brand-hover/70 active:bg-brand/80 disabled:bg-brand/50 disabled:ring-brand/50",
	secondary:
		"bg-surface text-neutral-700 shadow-xs ring ring-neutral-950/10 hover:bg-tint disabled:opacity-45",
	ghost:
		"bg-transparent text-neutral-600 ring-1 ring-transparent hover:ring-neutral-200 hover:bg-neutral-200 transition-all disabled:opacity-45",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: "sm" | "md" | "lg" | "square";
	icon?: ReactNode;
	loading?: boolean;
}

export function Button({
	variant = "primary",
	size = "md",
	icon,
	loading,
	children,
	className = "",
	disabled,
	...props
}: ButtonProps) {
	const sizeClass =
		size === "sm"
			? "h-7 px-2.5 text-xs rounded-md"
			: size === "lg"
				? "h-10 px-4 text-sm rounded-lg"
				: size === "square"
					? "h-8 w-8 p-0 rounded-md"
					: "h-8 px-3.5 text-[13px] rounded-md";

	return (
		<button
			className={`inline-flex items-center justify-center gap-1.5 font-medium transition-all cursor-pointer disabled:cursor-not-allowed ${variants[variant]} ${sizeClass} ${className}`}
			disabled={disabled || loading}
			{...props}
		>
			{loading && <Spinner />}
			{!loading && icon}
			{children}
		</button>
	);
}

function Spinner() {
	return (
		<span className="inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
	);
}

// Re-export Phosphor Sparkle for convenience
export { Sparkle as SparkleIcon } from "@phosphor-icons/react";

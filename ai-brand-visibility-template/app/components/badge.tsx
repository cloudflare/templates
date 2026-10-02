import type { ReactNode } from "react";

type BadgeVariant =
	| "openai"
	| "anthropic"
	| "google"
	| "workers-ai"
	| "meta"
	| "mistral"
	| "category"
	| "success"
	| "danger";

const variants: Record<BadgeVariant, string> = {
	openai: "bg-green-50 text-green-800 ring-1 ring-green-200/50",
	anthropic: "bg-orange-50 text-orange-800 ring-1 ring-orange-200/50",
	google: "bg-blue-50 text-blue-800 ring-1 ring-blue-200/50",
	"workers-ai": "bg-amber-50 text-amber-800 ring-1 ring-amber-200/50",
	meta: "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200/50",
	mistral: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/50",
	category: "bg-neutral-100 text-neutral-600",
	success: "bg-green-50 text-green-800",
	danger: "bg-red-50 text-red-800",
};

export function Badge({
	variant = "category",
	children,
}: {
	variant?: BadgeVariant;
	children: ReactNode;
}) {
	return (
		<span
			className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${variants[variant] ?? variants.category}`}
		>
			{children}
		</span>
	);
}

export function providerBadgeVariant(provider: string): BadgeVariant {
	if (provider in variants) return provider as BadgeVariant;
	return "category";
}

export function providerLabel(provider: string): string {
	const labels: Record<string, string> = {
		openai: "OpenAI",
		anthropic: "Anthropic",
		google: "Google",
		"workers-ai": "Workers AI",
		meta: "Meta",
		mistral: "Mistral",
	};
	return labels[provider] ?? provider;
}

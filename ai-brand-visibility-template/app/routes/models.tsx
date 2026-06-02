import { useLoaderData, useRevalidator } from "react-router";
import { useCallback } from "react";
import type { Route } from "./+types/models";
import { PageHeader, PageBody } from "~/components/page";
import { Card, CardHeader, CardBody } from "~/components/card";
import { Table, Thead, Th, Td, Tr } from "~/components/table";
import { Badge, providerBadgeVariant, providerLabel } from "~/components/badge";
import { NoSiteSelected } from "~/components/empty-state";
import { InfoIcon } from "@phosphor-icons/react";

export function meta() {
	return [{ title: "Models | AI Brand Visibility Template" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const sites = ((await env.AEO_KV.get("sites", "json")) as any[]) ?? [];
	const url = new URL(request.url);
	const siteParam = url.searchParams.get("site");
	const site = siteParam
		? sites.find((s: any) => s.domain === siteParam)
		: sites[0];

	const { MODELS } = await import("../../src/config");
	let enabled: string[] = MODELS.map((m) => m.id);
	if (site) {
		const raw = await env.AEO_KV.get(`site:${site.domain}:models`, "json");
		if (raw && Array.isArray(raw) && raw.length) enabled = raw as string[];
	}

	return {
		site,
		models: MODELS.map((m) => ({
			name: m.name,
			id: m.id,
			provider: m.provider,
		})),
		enabled,
	};
}

export default function Models({ loaderData }: Route.ComponentProps) {
	const { site, models, enabled } = loaderData;
	const revalidator = useRevalidator();

	if (!site) return <NoSiteSelected />;

	const toggleModel = useCallback(
		async (modelId: string, checked: boolean) => {
			let newEnabled = [...enabled];
			if (checked && !newEnabled.includes(modelId)) newEnabled.push(modelId);
			else newEnabled = newEnabled.filter((id) => id !== modelId);
			await fetch(`/api/sites/${encodeURIComponent(site.domain)}/models`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ models: newEnabled }),
			});
			revalidator.revalidate();
		},
		[site, enabled, revalidator],
	);

	return (
		<>
			<PageHeader
				title="Models"
				subtitle="Select which models to run. All models are available through AI Gateway."
			/>
			<PageBody>
				{/* Billing note */}
				<div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 ring-1 ring-blue-100 text-[13px] text-blue-800">
					<InfoIcon size={16} weight="fill" className="shrink-0 mt-0.5" />
					<div>
						<strong>Unified Billing.</strong> Third-party models (OpenAI,
						Anthropic, Google) are charged via{" "}
						<a
							href="https://dash.cloudflare.com/?to=/:account/ai/ai-gateway"
							target="_blank"
							rel="noopener"
							className="underline"
						>
							AI Gateway Unified Billing
						</a>
						. Workers AI models (<code className="text-[11px]">@cf/</code>) use
						standard Workers AI pricing. No API keys needed.
					</div>
				</div>

				{/* Model inventory */}
				<Card>
					<CardHeader>
						<span>Model inventory</span>
						<span className="text-xs text-neutral-400">
							{enabled.length} of {models.length} enabled
						</span>
					</CardHeader>
					<CardBody flush>
						<Table>
							<Thead>
								<tr>
									<Th style={{ width: 40 }} />
									<Th>Model</Th>
									<Th>Provider</Th>
									<Th>ID</Th>
								</tr>
							</Thead>
							<tbody>
								{models.map((m) => (
									<Tr key={m.id}>
										<Td>
											<input
												type="checkbox"
												checked={enabled.includes(m.id)}
												onChange={(e) => toggleModel(m.id, e.target.checked)}
												className="w-4 h-4 accent-brand cursor-pointer"
											/>
										</Td>
										<Td className="font-medium">{m.name}</Td>
										<Td>
											<Badge variant={providerBadgeVariant(m.provider)}>
												{providerLabel(m.provider)}
											</Badge>
										</Td>
										<Td className="font-mono text-[11px] text-neutral-500">
											{m.id}
										</Td>
									</Tr>
								))}
							</tbody>
						</Table>
					</CardBody>
				</Card>
			</PageBody>
		</>
	);
}

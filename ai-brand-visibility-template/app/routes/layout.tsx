import { Outlet, NavLink, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/layout";
import { Header } from "~/components/header";
import {
	Sidebar,
	SidebarSection,
	SidebarNav,
	SidebarNavItem,
} from "~/components/sidebar";
import { ChartBar, ListBullets, Cube, Plus } from "@phosphor-icons/react";

export async function loader({ context, request }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const sites = ((await env.AEO_KV.get("sites", "json")) as any[]) ?? [];
	// Get active site from ?site= param, default to first
	const url = new URL(request.url);
	const siteParam = url.searchParams.get("site");
	const activeSite =
		siteParam && sites.find((s: any) => s.domain === siteParam)
			? siteParam
			: (sites[0]?.domain ?? "");
	return { sites, activeSite };
}

export type DashboardContext = { activeSite: string; sites: any[] };

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
	const { sites, activeSite } = loaderData;
	const [searchParams] = useSearchParams();
	const ctx: DashboardContext = { activeSite, sites };

	// Build link with site param preserved
	const siteLink = (path: string) => {
		const params = new URLSearchParams(searchParams);
		if (activeSite) params.set("site", activeSite);
		// Remove testId if navigating away
		if (path !== "/") params.delete("testId");
		const qs = params.toString();
		return qs ? `${path}?${qs}` : path;
	};

	return (
		<>
			<Header domain={activeSite} />
			<div className="flex min-h-[calc(100vh-58px)]">
				<Sidebar>
					<SidebarSection label="Sites">
						{sites.map((s: any) => (
							<a
								key={s.domain}
								href={`/?site=${encodeURIComponent(s.domain)}`}
								className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
									s.domain === activeSite
										? "bg-neutral-100 text-neutral-900 font-medium"
										: "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
								}`}
							>
								<span className="truncate">{s.domain}</span>
							</a>
						))}
						<NavLink
							to="/setup"
							className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-brand border border-dashed border-neutral-200 hover:bg-blue-50 transition-colors mt-1"
						>
							<Plus size={14} weight="bold" />
							Add site
						</NavLink>
					</SidebarSection>

					<SidebarSection label="Views">
						<SidebarNav>
							<SidebarNavItem to={siteLink("/")} icon={<ChartBar size={16} />}>
								Results
							</SidebarNavItem>
							<SidebarNavItem
								to={siteLink("/prompts")}
								icon={<ListBullets size={16} />}
							>
								Prompts
							</SidebarNavItem>
							<SidebarNavItem
								to={siteLink("/models")}
								icon={<Cube size={16} />}
							>
								Models
							</SidebarNavItem>
						</SidebarNav>
					</SidebarSection>
				</Sidebar>

				<main className="flex-1 min-w-0 bg-canvas">
					<Outlet context={ctx} />
				</main>
			</div>
		</>
	);
}

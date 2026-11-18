import { useLoaderData, useRevalidator } from "react-router";
import { useState, useCallback } from "react";
import type { Route } from "./+types/prompts";
import { PageHeader, PageBody } from "~/components/page";
import { Card, CardHeader, CardBody } from "~/components/card";
import { Button } from "~/components/button";
import { NoSiteSelected } from "~/components/empty-state";
import { SparkleIcon, XIcon } from "@phosphor-icons/react";

export function meta() {
	return [{ title: "Prompts | AI Brand Visibility Template" }];
}

type Prompt = {
	text: string;
	active: boolean;
};

type SetupResponse = {
	prompts?: { text: string; tag: string }[];
};

export async function loader({ context, request }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const sites = ((await env.AEO_KV.get("sites", "json")) as any[]) ?? [];
	const url = new URL(request.url);
	const siteParam = url.searchParams.get("site");
	const site = siteParam
		? sites.find((s: any) => s.domain === siteParam)
		: sites[0];
	if (!site) return { site: null, prompts: [] };
	const prompts =
		((await env.AEO_KV.get(
			`site:${site.domain}:prompts`,
			"json",
		)) as Prompt[]) ?? [];
	return { site, prompts };
}

export default function Prompts({ loaderData }: Route.ComponentProps) {
	const { site, prompts } = loaderData;
	const revalidator = useRevalidator();
	const [input, setInput] = useState("");
	const [generating, setGenerating] = useState(false);
	const [suggestions, setSuggestions] = useState<
		{ text: string; tag: string }[]
	>([]);
	const [addedSet, setAddedSet] = useState<Set<string>>(new Set());

	const domain = site?.domain ?? "";

	const addPrompt = useCallback(
		async (text: string) => {
			await fetch(`/api/sites/${encodeURIComponent(domain)}/prompts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: text }),
			});
			revalidator.revalidate();
		},
		[domain, revalidator],
	);

	const togglePrompt = useCallback(
		async (text: string, active: boolean) => {
			await fetch(`/api/sites/${encodeURIComponent(domain)}/prompts`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: text, active }),
			});
			revalidator.revalidate();
		},
		[domain, revalidator],
	);

	const deletePrompt = useCallback(
		async (text: string) => {
			await fetch(`/api/sites/${encodeURIComponent(domain)}/prompts`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: text }),
			});
			revalidator.revalidate();
		},
		[domain, revalidator],
	);

	const generate = useCallback(async () => {
		setGenerating(true);
		try {
			const d = (await fetch(
				`/api/setup?domain=${encodeURIComponent(domain)}`,
			).then((r) => r.json())) as SetupResponse;
			setSuggestions(d.prompts ?? []);
			setAddedSet(new Set());
		} catch (e) {
			/* ignore */
		}
		setGenerating(false);
	}, [domain]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim()) return;
		addPrompt(input.trim());
		setInput("");
	};

	if (!site) return <NoSiteSelected />;

	return (
		<>
			<PageHeader
				title="Prompts"
				subtitle={`Manage prompts for ${domain}`}
				actions={
					<Button
						variant="secondary"
						onClick={generate}
						loading={generating}
						icon={<SparkleIcon size={14} />}
					>
						Generate suggestions
					</Button>
				}
			/>
			<PageBody>
				{/* Suggestions */}
				{suggestions.length > 0 && (
					<Card>
						<CardHeader>
							<span>Suggested prompts</span>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setSuggestions([])}
							>
								Dismiss
							</Button>
						</CardHeader>
						<CardBody className="flex flex-col gap-1.5">
							{suggestions.map((s, i) => (
								<div
									key={i}
									className="flex items-center gap-2 px-3.5 py-2.5 bg-tint rounded-lg text-[13px]"
								>
									<span className="flex-1 text-neutral-900">{s.text}</span>
									{s.tag && (
										<span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">
											{s.tag}
										</span>
									)}
									<Button
										variant="primary"
										size="sm"
										disabled={addedSet.has(s.text)}
										onClick={() => {
											addPrompt(s.text);
											setAddedSet((prev) => new Set(prev).add(s.text));
										}}
									>
										{addedSet.has(s.text) ? "Added" : "Add"}
									</Button>
								</div>
							))}
						</CardBody>
					</Card>
				)}

				{/* Active prompts */}
				<Card>
					<CardHeader>Active prompts</CardHeader>
					<CardBody flush>
						{prompts.length ? (
							prompts.map((p, i) => (
								<div
									key={i}
									className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 last:border-b-0 text-[13px] group"
								>
									<input
										type="checkbox"
										checked={p.active}
										onChange={(e) => togglePrompt(p.text, e.target.checked)}
										className="w-4 h-4 accent-brand cursor-pointer shrink-0"
									/>
									<span
										className={`flex-1 ${
											p.active ? "text-neutral-900" : "text-neutral-400"
										}`}
									>
										{p.text}
									</span>
									<button
										onClick={() => deletePrompt(p.text)}
										className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors opacity-0 group-hover:opacity-100"
										title="Remove"
									>
										<XIcon size={14} weight="bold" />
									</button>
								</div>
							))
						) : (
							<div className="py-12 text-center text-neutral-500 text-[13px]">
								No prompts yet. Use the Generate suggestions button above, or
								type one below.
							</div>
						)}
						<form
							onSubmit={handleSubmit}
							className="flex items-center gap-0 border-t border-neutral-100"
						>
							<input
								type="text"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								placeholder="Add a prompt..."
								className="flex-1 h-12 px-4 text-sm bg-transparent outline-none placeholder:text-neutral-400"
							/>
							<div className="pr-3">
								<Button type="submit" size="md">
									Add prompt
								</Button>
							</div>
						</form>
					</CardBody>
				</Card>
			</PageBody>
		</>
	);
}

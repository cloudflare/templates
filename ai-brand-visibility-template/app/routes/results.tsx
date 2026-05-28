import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { useState, useMemo, useEffect, useCallback } from "react";
import type { Route } from "./+types/results";
import { PageHeader, PageBody } from "~/components/page";
import { Card, CardBody, CardTitle } from "~/components/card";
import { Table, Thead, Th, Td, Tr } from "~/components/table";
import { Button } from "~/components/button";
import { DownloadButton } from "~/components/download-button";
import { NoSiteSelected } from "~/components/empty-state";
import { CaretDown, CaretLeft, CaretRight, Trash } from "@phosphor-icons/react";

const PAGE_SIZE = 20;

export function meta() {
	return [{ title: "Results | AI Brand Visibility" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const sites = ((await env.AEO_KV.get("sites", "json")) as any[]) ?? [];
	const url = new URL(request.url);
	const siteParam = url.searchParams.get("site");
	const site = siteParam
		? sites.find((s: any) => s.domain === siteParam)
		: sites[0];
	if (!site) return { site: null, latest: null };
	const history =
		((await env.AEO_KV.get(`site:${site.domain}:results`, "json")) as any[]) ??
		[];
	let latest = null;
	if (history.length)
		latest = await env.AEO_KV.get(`test:${history[0].id}`, "json");
	return { site, latest };
}

export default function Results({ loaderData }: Route.ComponentProps) {
	const { site, latest } = loaderData;
	const revalidator = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const [testing, setTesting] = useState(false);
	const [progress, setProgress] = useState({ completed: 0, total: 0 });
	const [activeTestId, setActiveTestId] = useState<string | null>(null);
	const [page, setPage] = useState(0);
	const [modelFilter, setModelFilter] = useState("all");
	const [promptFilter, setPromptFilter] = useState("all");

	const citations: any[] = (latest as any)?.citations ?? [];
	const testTimestamp =
		(latest as any)?.startedAt ?? (latest as any)?.timestamp ?? null;

	const uniqueModels = useMemo(
		() => [...new Set(citations.map((c) => c.model))],
		[citations],
	);
	const uniquePrompts = useMemo(
		() => [...new Set(citations.map((c) => c.prompt))],
		[citations],
	);
	const filtered = useMemo(
		() =>
			citations.filter(
				(c) =>
					(modelFilter === "all" || c.model === modelFilter) &&
					(promptFilter === "all" || c.prompt === promptFilter),
			),
		[citations, modelFilter, promptFilter],
	);

	const hasFilters = modelFilter !== "all" || promptFilter !== "all";
	const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
	const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

	// Reset page when filters change
	useEffect(() => {
		setPage(0);
	}, [modelFilter, promptFilter]);

	// Pick up testId from URL
	useEffect(() => {
		const testId = searchParams.get("testId");
		if (testId) {
			setActiveTestId(testId);
			setTesting(true);
			setSearchParams(
				(prev) => {
					const p = new URLSearchParams(prev);
					p.delete("testId");
					return p;
				},
				{ replace: true },
			);
		}
	}, []);

	if (!site) return <NoSiteSelected />;

	// Poll active test every 3s
	useEffect(() => {
		if (!activeTestId || !testing) return;
		let cancelled = false;
		const poll = async () => {
			while (!cancelled) {
				await new Promise((r) => setTimeout(r, 3000));
				try {
					const s = await fetch(`/api/tests/${activeTestId}/status`).then((r) =>
						r.json(),
					);
					if (cancelled) break;
					setProgress({ completed: s.completed, total: s.total });
					if (s.status === "complete") {
						setTesting(false);
						setActiveTestId(null);
						revalidator.revalidate();
						break;
					}
				} catch {
					/* keep trying */
				}
			}
		};
		poll();
		return () => {
			cancelled = true;
		};
	}, [activeTestId, testing, revalidator]);

	const runTest = useCallback(async () => {
		if (!site) return;
		setTesting(true);
		setProgress({ completed: 0, total: 0 });
		try {
			const run = await fetch(
				`/api/sites/${encodeURIComponent(site.domain)}/test`,
				{ method: "POST" },
			).then((r) => r.json());
			setActiveTestId(run.id);
			setProgress({ completed: 0, total: run.total });
		} catch (e) {
			alert(e instanceof Error ? e.message : "Test failed");
			setTesting(false);
		}
	}, [site]);

	const deleteSite = useCallback(async () => {
		if (!site) return;
		if (
			!confirm(`Delete ${site.domain} and all its data? This cannot be undone.`)
		)
			return;
		await fetch("/api/sites", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ domain: site.domain }),
		});
		window.location.href = "/";
	}, [site]);

	const downloadFilteredCsv = () => {
		if (!filtered.length) return;
		const header = "Date,Model,Prompt,Mentioned,Response\n";
		const rows = filtered
			.map((c) => {
				const esc = (s: string) =>
					s.includes(",") || s.includes('"') || s.includes("\n")
						? `"${s.replace(/"/g, '""')}"`
						: s;
				return [
					testTimestamp ?? "",
					c.model,
					esc(c.prompt),
					c.mentioned ? "Yes" : "No",
					esc(cleanResponse(c.response)),
				].join(",");
			})
			.join("\n");
		const blob = new Blob([header + rows], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `visibility-${site.domain}-${Date.now()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<>
			<PageHeader
				title="Results"
				subtitle={`${site.domain}${testTimestamp ? ` · ${new Date(testTimestamp).toLocaleString()}` : ""}`}
				actions={
					<>
						<Button onClick={runTest} loading={testing}>
							{testing ? `${progress.completed}/${progress.total}` : "Run test"}
						</Button>
						<Button
							variant="ghost"
							onClick={deleteSite}
							icon={<Trash size={14} />}
							className="text-neutral-400 hover:text-red-600"
						>
							Delete site
						</Button>
					</>
				}
			/>
			<PageBody>
				{/* Progress banner */}
				{testing && (
					<Card>
						<CardBody className="flex items-center gap-3">
							<span className="inline-block w-[18px] h-[18px] border-2 border-neutral-200 border-t-brand rounded-full animate-spin shrink-0" />
							<div className="flex-1 min-w-0">
								<div className="text-[13px] font-medium text-neutral-900">
									Querying {progress.total} model × prompt combinations...
								</div>
								<div className="mt-1.5 h-[3px] bg-neutral-200 rounded-full overflow-hidden">
									<div
										className="h-full bg-brand rounded-full transition-[width] duration-500"
										style={{
											width: `${progress.total ? Math.max(3, (progress.completed / progress.total) * 100) : 0}%`,
										}}
									/>
								</div>
							</div>
							<span className="text-[13px] font-bold font-mono text-neutral-900 tabular-nums shrink-0">
								{progress.completed}/{progress.total}
							</span>
						</CardBody>
					</Card>
				)}

				{/* Results */}
				{citations.length > 0 ? (
					<>
						{/* Filter bar */}
						<div
							className="sticky z-[100] flex flex-wrap items-center gap-2 px-3 py-2 text-base ring ring-neutral-950/10 bg-surface shadow-xs rounded-lg"
							style={{ top: 58 }}
						>
							<FilterSelect
								value={modelFilter}
								onChange={setModelFilter}
								placeholder="Model"
								options={uniqueModels.map((m) => ({ value: m, label: m }))}
							/>
							<FilterSelect
								value={promptFilter}
								onChange={setPromptFilter}
								placeholder="Prompt"
								options={uniquePrompts.map((p) => ({
									value: p,
									label: p.length > 50 ? p.slice(0, 47) + "..." : p,
								}))}
							/>
							{hasFilters && (
								<button
									onClick={() => {
										setModelFilter("all");
										setPromptFilter("all");
									}}
									className="text-[13px] text-neutral-500 hover:text-neutral-900 cursor-pointer transition-colors"
								>
									Clear
								</button>
							)}
							<div className="ml-auto flex items-center gap-2">
								<span className="text-[12px] text-neutral-400 tabular-nums">
									{filtered.length} result{filtered.length !== 1 ? "s" : ""}
								</span>
								<DownloadButton
									onClick={downloadFilteredCsv}
									label="Export current view"
								/>
							</div>
						</div>

						{/* Table */}
						<Card>
							<CardBody flush>
								<Table>
									<Thead>
										<tr>
											<Th>Date</Th>
											<Th>Model</Th>
											<Th>Prompt</Th>
											<Th>Response</Th>
										</tr>
									</Thead>
									<tbody>
										{paginated.map((c: any, i: number) => (
											<Tr key={i}>
												<Td className="text-neutral-500 text-xs whitespace-nowrap">
													{testTimestamp
														? new Date(testTimestamp).toLocaleDateString()
														: ""}
												</Td>
												<Td className="font-medium whitespace-nowrap text-[13px]">
													{c.model}
												</Td>
												<Td
													className="max-w-[240px] truncate text-[13px]"
													title={c.prompt}
												>
													{c.prompt}
												</Td>
												<Td
													className="max-w-[300px] truncate text-neutral-500 text-[13px]"
													title={c.response}
												>
													{cleanResponse(c.response)}
												</Td>
											</Tr>
										))}
									</tbody>
								</Table>

								{/* Pagination */}
								{totalPages > 1 && (
									<div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 text-[13px]">
										<span className="text-neutral-500">
											{page * PAGE_SIZE + 1}–
											{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of{" "}
											{filtered.length}
										</span>
										<div className="flex items-center gap-1">
											<button
												onClick={() => setPage((p) => Math.max(0, p - 1))}
												disabled={page === 0}
												className="w-8 h-8 flex items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
											>
												<CaretLeft size={14} weight="bold" />
											</button>
											{Array.from({ length: totalPages }, (_, i) => (
												<button
													key={i}
													onClick={() => setPage(i)}
													className={`w-8 h-8 flex items-center justify-center rounded-md text-[13px] font-medium transition-colors ${i === page ? "bg-brand text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
												>
													{i + 1}
												</button>
											))}
											<button
												onClick={() =>
													setPage((p) => Math.min(totalPages - 1, p + 1))
												}
												disabled={page >= totalPages - 1}
												className="w-8 h-8 flex items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
											>
												<CaretRight size={14} weight="bold" />
											</button>
										</div>
									</div>
								)}
							</CardBody>
						</Card>
					</>
				) : !testing ? (
					<Card>
						<CardBody>
							<div className="py-12 text-center text-neutral-500 text-[13px]">
								No results yet. Click "Run test" to analyze AI visibility for{" "}
								{site.domain}.
							</div>
						</CardBody>
					</Card>
				) : null}
			</PageBody>
		</>
	);
}

function FilterSelect({
	value,
	onChange,
	placeholder,
	options,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
	options: { value: string; label: string }[];
}) {
	const isActive = value !== "all";
	return (
		<div className="relative min-w-[140px] max-w-[240px]">
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={`w-full h-8 pl-3 pr-7 text-[13px] rounded-lg cursor-pointer outline-none transition-all appearance-none truncate ${isActive ? "bg-neutral-900 text-white ring-1 ring-neutral-900" : "bg-surface text-neutral-700 ring-1 ring-neutral-200 hover:ring-neutral-300"}`}
			>
				<option value="all">{placeholder}</option>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
			<CaretDown
				size={12}
				weight="bold"
				className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${isActive ? "text-white/70" : "text-neutral-400"}`}
			/>
		</div>
	);
}

function cleanResponse(text: string | undefined): string {
	if (!text) return "";
	let s = text;
	if (s.startsWith("{") || s.startsWith("[")) {
		try {
			const parsed = JSON.parse(s);
			if (parsed.choices?.[0]?.message?.content)
				s = parsed.choices[0].message.content;
			else if (parsed.choices?.[0]?.message?.reasoning_content)
				s = parsed.choices[0].message.reasoning_content;
			else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text)
				s = parsed.candidates[0].content.parts[0].text;
			else if (parsed.response) s = parsed.response;
		} catch {
			/* use as-is */
		}
	}
	s = s
		.replace(/#{1,6}\s+/g, "")
		.replace(/\*\*/g, "")
		.replace(/^\s*[-*]\s+/gm, "")
		.replace(/\n+/g, " ")
		.trim();
	return s.slice(0, 200);
}

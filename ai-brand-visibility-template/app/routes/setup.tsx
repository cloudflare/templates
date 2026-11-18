import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/button";
import { SparkleIcon, XIcon, PlusIcon } from "@phosphor-icons/react";

type ModelsResponse = {
	models: { name: string; id: string; provider: string }[];
};

type SetupResponse = {
	prompts?: (string | { text: string; tag?: string })[];
	brandName?: string;
};

type TestStart = {
	id: string;
};

export function meta() {
	return [{ title: "Add Site | AI Brand Visibility Template" }];
}

export default function Setup() {
	const navigate = useNavigate();
	const [step, setStep] = useState(0);
	const [domain, setDomain] = useState("");
	const [brandName, setBrandName] = useState("");
	const [competitorInput, setCompetitorInput] = useState("");
	const [competitors, setCompetitors] = useState<string[]>([]);
	const [suggestions, setSuggestions] = useState<
		{ text: string; tag: string }[]
	>([]);
	const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(
		new Set(),
	);
	const [models, setModels] = useState<
		{ name: string; id: string; provider: string }[]
	>([]);
	const [enabledModels, setEnabledModels] = useState<Set<string>>(new Set());
	const [loading, setLoading] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [customInput, setCustomInput] = useState("");
	const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
	const [cardHeight, setCardHeight] = useState(360);

	const clean = (d: string) =>
		d
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/\/.*/, "")
			.trim();

	useEffect(() => {
		const el = cardRefs.current[step];
		if (el) {
			const h = el.offsetHeight;
			if (h > 0) setCardHeight(h);
		}
	}, [
		step,
		suggestions.length,
		models.length,
		selectedPrompts.size,
		competitors.length,
	]);

	// Step 0 → 1: just save site + load models (fast, no AI call)
	// Brand detection is a simple domain parse — AI generation comes later on demand
	const submitDomain = useCallback(async () => {
		const d = clean(domain);
		if (!d) return;
		setLoading(true);
		// Derive brand name from domain (capitalize first segment)
		const slug = d.split(".")[0];
		const guessedBrand = slug.charAt(0).toUpperCase() + slug.slice(1);
		setBrandName(guessedBrand);
		// Save site + load models in parallel (both fast)
		const [, modelsData] = (await Promise.all([
			fetch("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: d, brandName: guessedBrand }),
			}),
			fetch("/api/models").then((r) => r.json()),
		])) as [Response, ModelsResponse];
		setModels(modelsData.models ?? []);
		setEnabledModels(new Set((modelsData.models ?? []).map((m: any) => m.id)));
		setLoading(false);
		setStep(1);
	}, [domain]);

	// Generate prompts with brand + competitors context
	const generateSuggestions = useCallback(async () => {
		const d = clean(domain);
		if (!d) return;
		setGenerating(true);
		try {
			const params = new URLSearchParams({ domain: d });
			if (brandName) params.set("brand", brandName);
			if (competitors.length) params.set("competitors", competitors.join(","));
			const resp = await fetch(`/api/setup?${params}`);
			const data = (await resp.json()) as SetupResponse;
			const sugs: { text: string; tag: string }[] = (data.prompts ?? [])
				.map((p: any) =>
					typeof p === "string"
						? { text: p, tag: "Category" }
						: { text: p.text ?? p, tag: p.tag ?? "Category" },
				)
				.filter((p: any) => p.text && p.text.length > 5);
			setSuggestions(sugs);
			setSelectedPrompts(new Set(sugs.map((s) => s.text)));
			if (data.brandName) setBrandName(data.brandName);
		} catch (e) {
			console.error("Generate failed:", e);
		}
		setGenerating(false);
	}, [domain, brandName, competitors]);

	const togglePrompt = (text: string) => {
		setSelectedPrompts((prev) => {
			const n = new Set(prev);
			n.has(text) ? n.delete(text) : n.add(text);
			return n;
		});
	};

	const addCustom = () => {
		if (!customInput.trim()) return;
		const t = customInput.trim();
		setSuggestions((p) => [...p, { text: t, tag: "Custom" }]);
		setSelectedPrompts((p) => new Set(p).add(t));
		setCustomInput("");
	};

	const addCompetitor = () => {
		if (!competitorInput.trim()) return;
		const c = competitorInput.trim();
		if (!competitors.includes(c)) setCompetitors((prev) => [...prev, c]);
		setCompetitorInput("");
	};

	const saveAndContinueFromCompetitors = async () => {
		const d = clean(domain);
		// Save site with brand + competitors
		await fetch("/api/sites", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ domain: d, brandName, competitors }),
		});
		setStep(2);
		// Re-generate prompts with competitor context if we have competitors
		if (competitors.length) generateSuggestions();
	};

	const runAnalysis = async () => {
		const d = clean(domain);
		const prompts = [...selectedPrompts];
		if (!prompts.length) return;
		await fetch(`/api/sites/${encodeURIComponent(d)}/prompts`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompts }),
		});
		await fetch(`/api/sites/${encodeURIComponent(d)}/models`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ models: [...enabledModels] }),
		});
		const run = (await fetch(`/api/sites/${encodeURIComponent(d)}/test`, {
			method: "POST",
		}).then((r) => r.json())) as TestStart;
		navigate(`/?site=${encodeURIComponent(d)}&testId=${run.id}`);
	};

	// 4 steps: Site, Competitors, Prompts, Models
	const stepLabels = ["Site", "Competitors", "Prompts", "Models"];
	const STEPS = 4;

	function variant(i: number) {
		if (i === step) return "current";
		if (i === step - 1) return "previous";
		if (i < step - 1) return "beforePrevious";
		return "after";
	}

	const COL_TOP = 180;
	const FRAME_TOP = COL_TOP - 30;
	const FRAME_BOTTOM_TOP = FRAME_TOP + cardHeight + 100;

	return (
		<div className="fixed inset-0 z-50 bg-canvas flex flex-col">
			<header className="sticky top-0 isolate flex h-[58px] shrink-0 items-center justify-between border-b border-neutral-200/60 px-4 sm:px-6 bg-surface">
				<a href="/" className="flex items-center">
					<svg
						height="18"
						viewBox="0 0 109 40"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M88.17 23.63l.31-.94c.37-1.27.23-2.44-.39-3.33-.58-.8-1.53-1.27-2.7-1.33l-21.8-.28a.32.32 0 01-.25-.17.31.31 0 01.02-.32.38.38 0 01.39-.33l21.93-.28c2.6-.12 5.42-2.25 6.4-4.85l1.25-3.28a.34.34 0 00.01-.43c-1.43-6.44-7.14-11.24-13.97-11.24-6.28 0-11.62 4.08-13.54 9.75-1.29-.98-2.93-1.43-4.54-1.27-3.01.3-5.44 2.73-5.74 5.73a7.16 7.16 0 00.17 2.25c-4.93.14-8.89 4.2-8.89 9.17 0 .44.03.88.1 1.32a.35.35 0 00.34.3l40.16.01a.35.35 0 00.32-.33z"
							fill="#F6821F"
						/>
						<path
							d="M96.4 8.93c-.2 0-.4.01-.6.02a.25.25 0 00-.27.23l-.86 3.07c-.37 1.27-.23 2.45.39 3.32.57.8 1.52 1.27 2.69 1.32l4.64.28a.32.32 0 01.32.16.32.32 0 01-.03.33.37.37 0 01-.4.15l-4.82.28c-2.62.12-5.44 2.24-6.43 4.82l-.35.92a.2.2 0 00.25.26l16.58.01a.35.35 0 00.37-.32c.05-.59.08-1.19.08-1.83 0-6.58-5.33-11.92-11.9-11.92z"
							fill="#FBAD41"
						/>
					</svg>
				</a>
				<a
					href="/"
					className="h-8 w-8 flex items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 transition-colors"
				>
					<XIcon size={16} weight="bold" />
				</a>
			</header>

			<div className="grow overflow-hidden relative">
				<div className="relative min-h-full flex items-center justify-center overflow-hidden">
					{/* Gridlines */}
					<div className="absolute inset-0 pointer-events-none" aria-hidden>
						<div
							className="absolute left-1/2 w-0 h-full border-l border-dashed border-neutral-300"
							style={{ marginLeft: -310 }}
						/>
						<div
							className="absolute left-1/2 w-0 h-full border-l border-dashed border-neutral-300"
							style={{ marginLeft: 310 }}
						/>
						<div
							className="absolute left-0 w-full border-t border-dashed border-neutral-300"
							style={{ top: FRAME_TOP }}
						/>
						<div
							className="absolute left-0 w-full border-t border-dashed border-neutral-300 transition-[top] duration-600"
							style={{
								top: FRAME_BOTTOM_TOP,
								transitionTimingFunction: "cubic-bezier(0.3,1,0.35,1)",
							}}
						/>
						<Cross left="calc(50% - 313px)" top={FRAME_TOP - 3} rot={0} />
						<Cross left="calc(50% + 307px)" top={FRAME_TOP - 3} rot={90} />
						<Cross
							left="calc(50% - 313px)"
							top={FRAME_BOTTOM_TOP - 3}
							rot={-90}
							anim
						/>
						<Cross
							left="calc(50% + 307px)"
							top={FRAME_BOTTOM_TOP - 3}
							rot={180}
							anim
						/>
					</div>

					<div
						className="w-full max-w-[38rem] absolute px-6"
						style={{ top: COL_TOP }}
					>
						<h1
							className="hidden xl:block absolute text-[15px] font-medium text-neutral-900 whitespace-nowrap text-right leading-snug"
							style={{ right: "calc(100% + 4rem)", top: -8 }}
						>
							AI Brand Visibility
							<br />
							Template
						</h1>
						<div
							className="hidden xl:flex flex-col absolute"
							style={{ left: "calc(100% + 3rem)", top: -4 }}
						>
							{stepLabels.map((label, i) => (
								<button
									key={label}
									onClick={() => i < step && setStep(i)}
									disabled={i >= step}
									className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors duration-300 ${i < step ? "text-neutral-500 hover:bg-neutral-100/50 cursor-pointer" : i === step ? "text-neutral-900" : "text-neutral-400"}`}
								>
									<span
										className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i < step ? "bg-neutral-400 border border-neutral-500" : i === step ? "bg-neutral-900" : "border border-neutral-400"}`}
									/>
									{label}
								</button>
							))}
						</div>

						{/* Card stack */}
						{Array.from({ length: STEPS }, (_, i) => {
							const v = variant(i);
							return (
								<div
									key={i}
									ref={(el) => {
										cardRefs.current[i] = el;
									}}
									className={v === "previous" ? "cursor-pointer" : ""}
									style={{
										position: v === "current" ? "relative" : "absolute",
										top: 0,
										left: 0,
										right: 0,
										zIndex: v === "current" ? 30 : v === "previous" ? 10 : 0,
										opacity: v === "current" ? 1 : v === "previous" ? 0.5 : 0,
										transform:
											v === "current"
												? "translateY(0) scale(1)"
												: v === "previous"
													? "translateY(-110%) scale(0.85)"
													: v === "beforePrevious"
														? "translateY(-210%) scale(1)"
														: "translateY(210%) scale(1)",
										transition:
											"transform 0.6s cubic-bezier(0.3,1,0.35,1), opacity 0.6s cubic-bezier(0.3,1,0.35,1)",
										pointerEvents:
											v === "current" || v === "previous" ? "auto" : "none",
										paddingBottom: 32,
									}}
									onClick={() => {
										if (v === "previous") setStep(i);
									}}
									onMouseEnter={(e) => {
										if (v === "previous") e.currentTarget.style.opacity = "1";
									}}
									onMouseLeave={(e) => {
										if (v === "previous") e.currentTarget.style.opacity = "0.5";
									}}
									tabIndex={v === "previous" ? 0 : -1}
									role={v === "previous" ? "button" : undefined}
									aria-label={
										v === "previous" ? `Go back to ${stepLabels[i]}` : undefined
									}
									aria-hidden={v !== "current" && v !== "previous"}
								>
									<div className="rounded-xl bg-neutral-100 ring ring-neutral-950/10">
										<div className="bg-white rounded-xl ring ring-neutral-200 p-7 flex flex-col gap-1">
											{i === 0 && (
												<StepSite
													domain={domain}
													setDomain={setDomain}
													loading={loading}
													onSubmit={submitDomain}
												/>
											)}
											{i === 1 && (
												<StepCompetitors
													brandName={brandName}
													setBrandName={setBrandName}
													competitors={competitors}
													setCompetitors={setCompetitors}
													competitorInput={competitorInput}
													setCompetitorInput={setCompetitorInput}
													addCompetitor={addCompetitor}
												/>
											)}
											{i === 2 && (
												<StepPrompts
													suggestions={suggestions}
													selectedPrompts={selectedPrompts}
													togglePrompt={togglePrompt}
													customInput={customInput}
													setCustomInput={setCustomInput}
													addCustom={addCustom}
													generating={generating}
													onGenerate={generateSuggestions}
												/>
											)}
											{i === 3 && (
												<StepModels
													models={models}
													enabledModels={enabledModels}
													setEnabledModels={setEnabledModels}
												/>
											)}
										</div>
										{v === "current" && (
											<div className="p-2 flex items-center justify-between gap-2">
												{i === 0 && (
													<>
														<div />
														<Button onClick={submitDomain} loading={loading}>
															Continue
														</Button>
													</>
												)}
												{i === 1 && (
													<>
														<Button variant="ghost" onClick={() => setStep(0)}>
															Back
														</Button>
														<div className="flex gap-2">
															<Button
																variant="ghost"
																onClick={() => {
																	saveAndContinueFromCompetitors();
																}}
															>
																Skip
															</Button>
															<Button onClick={saveAndContinueFromCompetitors}>
																Continue
															</Button>
														</div>
													</>
												)}
												{i === 2 && (
													<>
														<Button variant="ghost" onClick={() => setStep(1)}>
															Back
														</Button>
														<Button
															onClick={() => setStep(3)}
															disabled={selectedPrompts.size === 0}
														>
															Continue
														</Button>
													</>
												)}
												{i === 3 && (
													<>
														<Button variant="ghost" onClick={() => setStep(2)}>
															Back
														</Button>
														<Button
															onClick={runAnalysis}
															disabled={
																enabledModels.size === 0 ||
																selectedPrompts.size === 0
															}
														>
															Run analysis
														</Button>
													</>
												)}
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}

function StepSite({ domain, setDomain, loading, onSubmit }: any) {
	return (
		<>
			<div className="text-[17px]/[1.25] font-medium text-neutral-900">
				Enter your site
			</div>
			<div className="text-sm text-neutral-500 mb-3 leading-relaxed">
				Enter the domain you want to monitor.
			</div>
			<input
				type="text"
				value={domain}
				onChange={(e: any) => setDomain(e.target.value)}
				onKeyDown={(e: any) => e.key === "Enter" && onSubmit()}
				placeholder="yourdomain.com"
				className="w-full h-11 px-4 text-[15px] bg-white ring ring-neutral-950/10 rounded-[10px] shadow-xs outline-none focus:ring-neutral-400 transition-shadow"
				autoFocus
				disabled={loading}
			/>
		</>
	);
}

function StepCompetitors({
	brandName,
	setBrandName,
	competitors,
	setCompetitors,
	competitorInput,
	setCompetitorInput,
	addCompetitor,
}: any) {
	return (
		<>
			<div className="text-[17px]/[1.25] font-medium text-neutral-900">
				Brand &amp; competitors
			</div>
			<div className="text-sm text-neutral-500 mb-3 leading-relaxed">
				Confirm your brand name and optionally add competitors for comparison
				prompts.
			</div>
			<label className="text-[12px] font-medium text-neutral-500 mb-1 block">
				Brand name
			</label>
			<input
				type="text"
				value={brandName}
				onChange={(e: any) => setBrandName(e.target.value)}
				placeholder="Your brand name"
				className="w-full h-9 px-3 text-sm bg-white ring ring-neutral-950/10 rounded-lg shadow-xs outline-none focus:ring-neutral-400 transition-shadow mb-4"
			/>
			<label className="text-[12px] font-medium text-neutral-500 mb-1 block">
				Competitors <span className="text-neutral-400">(optional)</span>
			</label>
			{competitors.length > 0 && (
				<div className="flex flex-wrap gap-1.5 mb-2">
					{competitors.map((c: string) => (
						<span
							key={c}
							className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-100 text-[13px] text-neutral-700 ring-1 ring-neutral-950/5"
						>
							{c}
							<button
								onClick={() =>
									setCompetitors((prev: string[]) =>
										prev.filter((x) => x !== c),
									)
								}
								className="text-neutral-400 hover:text-neutral-700 transition-colors"
							>
								<XIcon size={12} weight="bold" />
							</button>
						</span>
					))}
				</div>
			)}
			<div className="flex gap-2">
				<input
					type="text"
					value={competitorInput}
					onChange={(e: any) => setCompetitorInput(e.target.value)}
					onKeyDown={(e: any) => {
						if (e.key === "Enter") {
							e.preventDefault();
							addCompetitor();
						}
					}}
					placeholder="e.g. Akamai, Fastly..."
					className="flex-1 h-9 px-3 text-sm bg-white ring ring-neutral-950/10 rounded-lg shadow-xs outline-none focus:ring-neutral-400 transition-shadow"
				/>
				<Button
					variant="secondary"
					size="md"
					onClick={addCompetitor}
					icon={<PlusIcon size={14} />}
					className="h-9"
				>
					Add
				</Button>
			</div>
		</>
	);
}

function StepPrompts({
	suggestions,
	selectedPrompts,
	togglePrompt,
	customInput,
	setCustomInput,
	addCustom,
	generating,
	onGenerate,
}: any) {
	return (
		<>
			<div className="text-[17px]/[1.25] font-medium text-neutral-900">
				Select prompts to test
			</div>
			<div className="text-sm text-neutral-500 mb-3 leading-relaxed">
				Check the prompts you want to test. Generate AI suggestions or add your
				own.
			</div>
			{suggestions.length === 0 && (
				<button
					onClick={onGenerate}
					disabled={generating}
					className="w-full flex items-center justify-center gap-2 p-4 rounded-[10px] border border-dashed border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50 text-sm text-neutral-600 transition-colors cursor-pointer disabled:opacity-50"
				>
					{generating ? (
						<span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
					) : (
						<SparkleIcon size={16} />
					)}
					{generating ? "Generating prompts..." : "Generate suggested prompts"}
				</button>
			)}
			{suggestions.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400 mb-0.5">
						<SparkleIcon size={12} /> {selectedPrompts.size} selected
					</div>
					{suggestions.map((s: any, i: number) => (
						<label
							key={i}
							className="flex items-center gap-3 p-3 rounded-[10px] bg-white shadow-xs ring-1 ring-neutral-950/10 hover:bg-neutral-50 cursor-pointer transition-colors"
						>
							<input
								type="checkbox"
								checked={selectedPrompts.has(s.text)}
								onChange={() => togglePrompt(s.text)}
								className="w-4 h-4 accent-brand rounded cursor-pointer shrink-0"
							/>
							<span className="flex-1 text-[13px] text-neutral-900 leading-snug">
								{s.text}
							</span>
							<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500 ring-1 ring-neutral-950/5 shrink-0">
								{s.tag}
							</span>
						</label>
					))}
					<button
						onClick={onGenerate}
						disabled={generating}
						className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 mt-1 cursor-pointer disabled:opacity-50"
					>
						{generating ? (
							<span className="inline-block w-3 h-3 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
						) : (
							<SparkleIcon size={12} />
						)}
						{generating ? "Regenerating..." : "Regenerate"}
					</button>
				</div>
			)}
			<div className="flex gap-2 mt-3">
				<input
					type="text"
					value={customInput}
					onChange={(e: any) => setCustomInput(e.target.value)}
					onKeyDown={(e: any) => {
						if (e.key === "Enter") {
							e.preventDefault();
							addCustom();
						}
					}}
					placeholder="Add a custom prompt..."
					className="flex-1 h-9 px-3 text-sm bg-white ring ring-neutral-950/10 rounded-lg shadow-xs outline-none focus:ring-neutral-400 transition-shadow"
				/>
				<Button
					variant="secondary"
					size="md"
					onClick={addCustom}
					className="h-9"
				>
					Add
				</Button>
			</div>
		</>
	);
}

function StepModels({ models, enabledModels, setEnabledModels }: any) {
	return (
		<>
			<div className="text-[17px]/[1.25] font-medium text-neutral-900">
				Confirm models
			</div>
			<div className="text-sm text-neutral-500 mb-3 leading-relaxed">
				Select which AI models to test. Usage charges apply.
			</div>
			<div className="flex flex-col gap-1.5">
				{models.map((m: any) => (
					<label
						key={m.id}
						className="flex items-center gap-3 p-3 rounded-[10px] bg-white shadow-xs ring-1 ring-neutral-950/10 hover:bg-neutral-50 cursor-pointer transition-colors"
					>
						<input
							type="checkbox"
							checked={enabledModels.has(m.id)}
							onChange={(e: any) => {
								setEnabledModels((prev: Set<string>) => {
									const n = new Set(prev);
									e.target.checked ? n.add(m.id) : n.delete(m.id);
									return n;
								});
							}}
							className="w-4 h-4 accent-brand rounded cursor-pointer shrink-0"
						/>
						<span className="flex-1 text-[13px] font-medium text-neutral-900">
							{m.name}
						</span>
						<ProviderPill provider={m.provider} />
					</label>
				))}
			</div>
			<div className="mt-4 p-3 bg-blue-50 rounded-[10px] ring-1 ring-blue-100 text-xs text-blue-800">
				Third-party models (OpenAI, Anthropic, Google) use{" "}
				<strong>AI Gateway Unified Billing</strong>. Workers AI models use
				standard pricing. No API keys needed.
			</div>
		</>
	);
}

function ProviderPill({ provider }: { provider: string }) {
	const styles: Record<string, string> = {
		openai: "bg-green-50 text-green-800 ring-green-200/50",
		anthropic: "bg-orange-50 text-orange-800 ring-orange-200/50",
		google: "bg-blue-50 text-blue-800 ring-blue-200/50",
		"workers-ai": "bg-amber-50 text-amber-800 ring-amber-200/50",
	};
	const labels: Record<string, string> = {
		openai: "OpenAI",
		anthropic: "Anthropic",
		google: "Google",
		"workers-ai": "Workers AI",
	};
	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ring-1 ${styles[provider] ?? "bg-neutral-50 text-neutral-700 ring-neutral-200/50"}`}
		>
			{labels[provider] ?? provider}
		</span>
	);
}

function Cross({
	left,
	top,
	rot = 0,
	anim,
}: {
	left: string;
	top: number;
	rot?: number;
	anim?: boolean;
}) {
	return (
		<div
			className="absolute w-[7px] h-[7px] rounded-[1.5px] ring-1 ring-neutral-400 bg-canvas"
			style={{
				left,
				top,
				transform: `rotate(${rot}deg)`,
				...(anim ? { transition: "top 0.6s cubic-bezier(0.3,1,0.35,1)" } : {}),
			}}
		/>
	);
}

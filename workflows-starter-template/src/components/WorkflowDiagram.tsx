import { useMemo, useRef, useState, useEffect } from "react";
import type { StepDefinition, StepStatus } from "../types";

// Layout constants
const NODE_HEIGHT = 48;
const NODE_WIDTH = 270;
const VERTICAL_GAP = 100;

interface WorkflowDiagramProps {
	steps: StepDefinition[];
	stepStatuses: Record<string, StepStatus>;
	currentStep: string | null;
	instanceId: string | null;
	workflowStatus: "idle" | "running" | "completed" | "error";
	onStartWorkflow: () => void;
	isStarting: boolean;
}

interface NodePosition {
	x: number;
	y: number;
}

export function WorkflowDiagram({
	steps,
	stepStatuses,
	currentStep,
	instanceId,
	workflowStatus,
	onStartWorkflow,
	isStarting,
}: WorkflowDiagramProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(400);

	// Measure container width and update on resize
	useEffect(() => {
		const updateWidth = () => {
			if (containerRef.current) {
				setContainerWidth(containerRef.current.offsetWidth);
			}
		};

		updateWidth();
		window.addEventListener("resize", updateWidth);
		return () => window.removeEventListener("resize", updateWidth);
	}, []);

	const handleApprove = async (approved: boolean) => {
		if (!instanceId) return;

		try {
			await fetch(`/api/workflow/event/${instanceId}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					approved,
					comment: approved ? "Approved via UI" : "Rejected via UI",
				}),
			});
		} catch {
			// Silently fail - workflow will timeout if event not received
		}
	};

	const { nodes, edges, totalHeight } = useMemo(() => {
		const nodes: Array<{
			id: string;
			type: "start" | "end" | "step";
			position: NodePosition;
			step?: StepDefinition;
		}> = [];

		const edges: Array<{
			from: string;
			to: string;
			fromPos: NodePosition;
			toPos: NodePosition;
		}> = [];

		const centerX = containerWidth / 2 - 25;
		let currentY = 60;

		nodes.push({
			id: "start",
			type: "start",
			position: { x: centerX, y: currentY },
		});

		let prevId = "start";
		currentY += VERTICAL_GAP;

		for (const step of steps) {
			nodes.push({
				id: step.id,
				type: "step",
				position: { x: centerX, y: currentY },
				step,
			});

			edges.push({
				from: prevId,
				to: step.id,
				fromPos: nodes.find((n) => n.id === prevId)!.position,
				toPos: { x: centerX, y: currentY },
			});

			prevId = step.id;
			currentY += VERTICAL_GAP;
		}

		nodes.push({
			id: "end",
			type: "end",
			position: { x: centerX, y: currentY },
		});

		edges.push({
			from: prevId,
			to: "end",
			fromPos: nodes.find((n) => n.id === prevId)!.position,
			toPos: { x: centerX, y: currentY },
		});

		return {
			nodes,
			edges,
			totalHeight: currentY + 100,
		};
	}, [steps, containerWidth]);

	return (
		<div className="relative overflow-auto h-full">
			{/* Diagram content */}
			<div
				ref={containerRef}
				className="relative mx-auto pt-8 w-full"
				style={{
					minHeight: `${totalHeight}px`,
					maxWidth: "600px",
				}}
			>
				{/* SVG for edges */}
				<svg
					className="absolute inset-0 pointer-events-none"
					style={{ width: "100%", height: "100%" }}
				>
					{edges.map((edge, idx) => {
						const dx = edge.toPos.x - edge.fromPos.x;
						const dy = edge.toPos.y - edge.fromPos.y;
						const midY = edge.fromPos.y + dy / 2;

						const fromNode = nodes.find((n) => n.id === edge.from);
						const toNode = nodes.find((n) => n.id === edge.to);

						let fromY: number;
						if (fromNode?.type === "start" || fromNode?.type === "end") {
							fromY = edge.fromPos.y + 20;
						} else {
							fromY = edge.fromPos.y + NODE_HEIGHT / 2;
						}

						let toY: number;
						if (toNode?.type === "start" || toNode?.type === "end") {
							toY = edge.toPos.y - 20;
						} else {
							toY = edge.toPos.y - NODE_HEIGHT / 2;
						}

						return (
							<path
								key={`${edge.from}-${edge.to}-${idx}`}
								d={`M ${edge.fromPos.x} ${fromY}
									L ${edge.fromPos.x} ${midY}
									${dx !== 0 ? `L ${edge.toPos.x} ${midY}` : ""}
									L ${edge.toPos.x} ${toY}`}
								className="stroke-neutral-300/70 dark:stroke-neutral-500/60"
								strokeWidth="2"
								fill="none"
							/>
						);
					})}
				</svg>

				{/* Nodes */}
				{nodes.map((node) => {
					if (node.type === "start") {
						const canClick = workflowStatus === "idle" && !isStarting;

						return (
							<div
								key={node.id}
								className="absolute flex items-center justify-center"
								style={{
									left: node.position.x - 60,
									top: node.position.y,
									width: 120,
									height: 40,
								}}
							>
								<button
									onClick={canClick ? onStartWorkflow : undefined}
									disabled={!canClick}
									className={`backdrop-blur-xl bg-neutral-900/90 dark:bg-neutral-700/90 text-white rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide shadow-lg shadow-black/20 transition-all ${
										isStarting
											? "ring-1 ring-white/10 opacity-60 animate-pulse cursor-not-allowed"
											: canClick
												? "ring-1 ring-white/10 hover:bg-neutral-700 hover:scale-105 cursor-pointer"
												: "ring-1 ring-white/10 opacity-40 cursor-not-allowed"
									}`}
								>
									START
								</button>
							</div>
						);
					}

					if (node.type === "end") {
						return (
							<div
								key={node.id}
								className="absolute flex items-center justify-center"
								style={{
									left: node.position.x - 60,
									top: node.position.y - 20,
									width: 120,
									height: 40,
								}}
							>
								<div className="backdrop-blur-xl bg-neutral-900/90 dark:bg-neutral-700/90 text-white rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide shadow-lg shadow-black/20 ring-1 ring-white/10">
									END
								</div>
							</div>
						);
					}

					const step = node.step!;
					const status = stepStatuses[step.name] || "pending";
					const isRunning = currentStep === step.name;

					return (
						<div
							key={node.id}
							className="absolute"
							style={{
								left: node.position.x,
								top: node.position.y - NODE_HEIGHT / 2,
								transform: "translateX(-50%)",
								width: NODE_WIDTH,
							}}
						>
							<div
								className={`flex flex-col gap-2 backdrop-blur-xl rounded-xl shadow-float p-3 transition-all ring-1 ${
									isRunning
										? "bg-blue-500/5 dark:bg-blue-500/10 ring-blue-400/40 dark:ring-blue-500/40"
										: status === "waiting"
											? "bg-yellow-500/5 dark:bg-yellow-500/10 ring-yellow-400/40 dark:ring-yellow-500/40"
											: status === "completed"
												? "bg-white/60 dark:bg-neutral-900/60 ring-green-400/30 dark:ring-green-500/30"
												: "bg-white/60 dark:bg-neutral-900/60 ring-black/5 dark:ring-white/10"
								}`}
							>
								<div className="flex items-center gap-2">
									{/* Step badge */}
									<div
										className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium shrink-0 ${
											status === "completed"
												? "bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-400"
												: status === "waiting"
													? "bg-yellow-500/10 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"
													: status === "running"
														? "bg-blue-500/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400"
														: "bg-neutral-500/10 dark:bg-neutral-500/20 text-neutral-600 dark:text-neutral-300"
										}`}
									>
										{status === "completed" ? (
											<svg
												className="w-3.5 h-3.5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M5 13l4 4L19 7"
												/>
											</svg>
										) : status === "waiting" ? (
											<svg
												className="w-3.5 h-3.5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
												/>
											</svg>
										) : status === "running" ? (
											<svg
												className="w-3.5 h-3.5 animate-spin"
												fill="none"
												viewBox="0 0 24 24"
											>
												<circle
													className="opacity-25"
													cx="12"
													cy="12"
													r="10"
													stroke="currentColor"
													strokeWidth="4"
												/>
												<path
													className="opacity-75"
													fill="currentColor"
													d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
												/>
											</svg>
										) : (
											<svg
												className="w-3.5 h-3.5"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<circle cx="10" cy="10" r="3" />
											</svg>
										)}
										<span className="whitespace-nowrap">Step</span>
									</div>

									{/* Step name */}
									<div className="flex flex-col gap-0.5 flex-1 min-w-0">
										<span className="text-sm font-mono font-medium text-neutral-900 dark:text-neutral-100">
											{step.name}
										</span>
										<span className="text-xs text-neutral-500 dark:text-neutral-400">
											{step.description}
										</span>
									</div>
								</div>
							</div>
						</div>
					);
				})}

				{nodes.map((node) => {
					if (node.type === "step") {
						const step = node.step!;
						const status = stepStatuses[step.name] || "pending";
						const showApprovalButton =
							status === "waiting" && step.id === "wait-for-approval";

						if (showApprovalButton) {
							return (
								<div
									key={`approval-${node.id}`}
									className="absolute animate-in fade-in slide-in-from-top-2 duration-300"
									style={{
										left: node.position.x,
										top: node.position.y + NODE_HEIGHT / 2 + 12,
										transform: "translateX(-50%)",
										zIndex: 100,
									}}
								>
									<div className="absolute left-1/2 -translate-x-1/2 -top-[5px] w-3 h-3 backdrop-blur-xl bg-neutral-900/90 dark:bg-neutral-700/90 rotate-45" />

									<button
										onClick={() => handleApprove(true)}
										className="relative px-4 py-2 backdrop-blur-xl bg-neutral-900/90 dark:bg-neutral-700/90 hover:bg-neutral-700 text-white text-xs font-medium rounded-lg transition-all shadow-xl whitespace-nowrap"
									>
										Approve
									</button>
								</div>
							);
						}
					}
					return null;
				})}
			</div>
		</div>
	);
}

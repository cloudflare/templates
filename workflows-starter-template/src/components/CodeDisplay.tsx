import { WORKFLOW_STEPS } from "../types";
import type { JSX } from "react";

interface CodeDisplayProps {
	currentStep: string | null;
	workflowStatus: "idle" | "running" | "completed" | "error";
	onStartWorkflow: () => void;
	isStarting: boolean;
}

// The workflow code to display (simplified for illustration)
const WORKFLOW_CODE = `export class MyWorkflow extends WorkflowEntrypoint<Env> {
  async run(event: WorkflowEvent, step: WorkflowStep) {
    // Step 1: Process some data
    const result = await step.do('process data', async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { processed: true, timestamp: Date.now() };
    });

    // Step 2: Wait 2 seconds
    await step.sleep('wait 2 seconds', '2 seconds');

    // Step 3: Wait for user approval
    const approval = await step.waitForEvent('wait for approval', {
      type: 'user-approval',
      timeout: '60 minutes'
    });

    // Step 4: Final step
    await step.do('final', async () => {
      console.log('Results:', { result, approval: approval.payload });
      await new Promise(resolve => setTimeout(resolve, 1000));
    });
  }
}`;

// Simple syntax highlighting
function highlightSyntax(line: string): JSX.Element {
	// Comments take precedence
	if (line.trim().startsWith("//")) {
		return (
			<span className="text-neutral-500 dark:text-neutral-400">{line}</span>
		);
	}

	// Split by tokens and wrap with appropriate colors
	const tokens = line.split(
		/(\b(?:export|class|extends|async|await|const|return|new|Promise)\b|'[^']*'|"[^"]*"|\b\d+\b)/g,
	);

	return (
		<>
			{tokens.map((token, i) => {
				if (!token) return null;

				// Keywords
				if (
					/^(export|class|extends|async|await|const|return|new|Promise)$/.test(
						token,
					)
				) {
					return (
						<span key={i} className="text-[#0054a6] dark:text-[#61afef]">
							{token}
						</span>
					);
				}
				// Strings
				if (/^['"]/.test(token)) {
					return (
						<span key={i} className="text-[#a85454] dark:text-[#d19a66]">
							{token}
						</span>
					);
				}
				// Numbers
				if (/^\d+$/.test(token)) {
					return (
						<span key={i} className="text-[#047857] dark:text-[#98c379]">
							{token}
						</span>
					);
				}
				// Default
				return <span key={i}>{token}</span>;
			})}
		</>
	);
}

export function CodeDisplay({
	currentStep,
	workflowStatus,
	onStartWorkflow,
	isStarting,
}: CodeDisplayProps) {
	const lines = WORKFLOW_CODE.split("\n");

	// Find the line range for the current step
	const currentStepDef = WORKFLOW_STEPS.find((s) => s.name === currentStep);
	const highlightRange = currentStepDef?.lineRange;
	const isIdle = workflowStatus === "idle" && !isStarting;

	return (
		<div className="h-full overflow-auto p-4">
			<div className="backdrop-blur-xl bg-white/80 dark:bg-neutral-900/80 rounded-2xl shadow-float ring-glass overflow-hidden">
				{/* Window chrome header */}
				<div className="flex items-center gap-2 px-4 py-3">
					<div className="flex gap-1.5">
						<div className="w-3 h-3 rounded-full bg-neutral-300 dark:bg-neutral-500" />
						<div className="w-3 h-3 rounded-full bg-neutral-300 dark:bg-neutral-500" />
						<div className="w-3 h-3 rounded-full bg-neutral-300 dark:bg-neutral-500" />
					</div>
					<div className="flex-1 text-center">
						<span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
							workflow.ts
						</span>
					</div>
					<button
						onClick={isIdle ? onStartWorkflow : undefined}
						disabled={!isIdle}
						className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
							isIdle
								? "bg-neutral-900 dark:bg-neutral-800 text-white hover:bg-neutral-700 cursor-pointer"
								: "bg-neutral-200 dark:bg-neutral-700 text-neutral-400 dark:text-neutral-500 cursor-not-allowed"
						}`}
					>
						Start
					</button>
				</div>

				{/* Code content */}
				<pre className="px-6 pb-6 pt-4 overflow-x-auto">
					<code className="text-[13px] font-mono leading-relaxed block min-w-max text-neutral-800 dark:text-neutral-200">
						{lines.map((line, idx) => {
							const lineNum = idx + 1;
							const isHighlighted =
								highlightRange &&
								lineNum >= highlightRange[0] &&
								lineNum <= highlightRange[1];

							// Determine if this is first or last highlighted line for rounded corners
							const isFirstHighlighted =
								isHighlighted && lineNum === highlightRange![0];
							const isLastHighlighted =
								isHighlighted && lineNum === highlightRange![1];

							return (
								<div
									key={idx}
									className={`transition-all duration-200 ${
										isHighlighted
											? `bg-blue-500/10 dark:bg-blue-500/20 -mx-3 px-3 ${
													isFirstHighlighted && isLastHighlighted
														? "rounded"
														: isFirstHighlighted
															? "rounded-t"
															: isLastHighlighted
																? "rounded-b"
																: ""
												}`
											: ""
									}`}
								>
									<span
										className={`whitespace-pre ${
											isHighlighted ? "font-medium" : ""
										}`}
									>
										{highlightSyntax(line || " ")}
									</span>
								</div>
							);
						})}
					</code>
				</pre>
			</div>
		</div>
	);
}

/**
 * Shared TypeScript types for the Workflows starter template
 */

export type StepStatus =
	| "pending"
	| "running"
	| "waiting"
	| "completed"
	| "error";
export type WorkflowStatus = "idle" | "running" | "completed" | "error";

export interface StepDefinition {
	id: string;
	name: string;
	description: string;
	lineRange: [number, number];
}

export interface WorkflowState {
	instanceId: string | null;
	currentStep: string | null;
	stepStatuses: Record<string, StepStatus>;
	workflowStatus: WorkflowStatus;
	wsConnected: boolean;
}

export interface WorkflowUpdateMessage {
	type: "workflow_update";
	currentStep: string | null;
	stepStatuses: Record<string, StepStatus>;
	workflowStatus: "running" | "completed" | "error";
	timestamp: number;
}

// Step definitions for the workflow
export const WORKFLOW_STEPS: StepDefinition[] = [
	{
		id: "process-data",
		name: "process data",
		description: "Break code into durable steps",
		lineRange: [3, 7],
	},
	{
		id: "wait-2-seconds",
		name: "wait 2 seconds",
		description: "Add time-based delays",
		lineRange: [9, 10],
	},
	{
		id: "wait-for-approval",
		name: "wait for approval",
		description: "Pause for external events",
		lineRange: [12, 16],
	},
	{
		id: "final",
		name: "final",
		description: "Use data from previous steps",
		lineRange: [18, 22],
	},
];

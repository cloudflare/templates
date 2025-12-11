import { useEffect, useReducer } from "react";
import type {
	WorkflowState,
	WorkflowUpdateMessage,
	StepStatus,
} from "../types";
import { WORKFLOW_STEPS } from "../types";

type Action =
	| { type: "CONNECTED" }
	| { type: "DISCONNECTED" }
	| { type: "UPDATE"; payload: WorkflowUpdateMessage }
	| { type: "RESET" };

const initialState: WorkflowState = {
	instanceId: null,
	currentStep: null,
	stepStatuses: Object.fromEntries(
		WORKFLOW_STEPS.map((step) => [step.name, "pending" as StepStatus]),
	),
	workflowStatus: "idle",
	wsConnected: false,
};

function workflowReducer(state: WorkflowState, action: Action): WorkflowState {
	switch (action.type) {
		case "CONNECTED":
			return { ...state, wsConnected: true };

		case "DISCONNECTED":
			return { ...state, wsConnected: false };

		case "UPDATE":
			return {
				...state,
				currentStep: action.payload.currentStep,
				stepStatuses: action.payload.stepStatuses,
				workflowStatus: action.payload.workflowStatus,
			};

		case "RESET":
			return { ...initialState };

		default:
			return state;
	}
}

export function useWorkflowWebSocket(instanceId: string | null): WorkflowState {
	const [state, dispatch] = useReducer(workflowReducer, initialState);

	useEffect(() => {
		if (!instanceId) {
			dispatch({ type: "RESET" });
			return;
		}

		// Determine WebSocket protocol based on current location
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsUrl = `${protocol}//${window.location.host}/ws?instanceId=${instanceId}`;

		const ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			dispatch({ type: "CONNECTED" });
		};

		ws.onclose = () => {
			dispatch({ type: "DISCONNECTED" });
		};

		ws.onerror = () => {
			// Connection errors handled by onclose
		};

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				if (data.type === "workflow_update") {
					dispatch({ type: "UPDATE", payload: data });
				}
			} catch {
				// Ignore malformed messages
			}
		};

		return () => {
			ws.close();
		};
	}, [instanceId]);

	return state;
}

import { env, introspectWorkflowInstance } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("MyWorkflow", () => {
	it("completes and returns expected step result", async () => {
		const instanceId = `test-${Date.now()}`;

		await using instance = await introspectWorkflowInstance(
			env.MY_WORKFLOW,
			instanceId,
		);

		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockEvent({
				type: "user-approval",
				payload: { approved: true },
			});
		});

		await env.MY_WORKFLOW.create({ id: instanceId });

		const result = await instance.waitForStepResult({ name: "process data" });

		expect(result).toMatchObject({
			processed: true,
		});
		expect(result).toHaveProperty("timestamp");
	});

	it("errors when approval event times out", async () => {
		const instanceId = `test-${Date.now()}`;

		await using instance = await introspectWorkflowInstance(
			env.MY_WORKFLOW,
			instanceId,
		);

		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.forceEventTimeout({ name: "wait for approval" });
		});

		await env.MY_WORKFLOW.create({ id: instanceId });

		await expect(instance.waitForStatus("errored")).resolves.not.toThrow();
	});
});

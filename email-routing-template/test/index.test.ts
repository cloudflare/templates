import { SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import worker, { handleEmail } from "../src/index";

type TestEnv = Omit<Env, "ALLOWED_SENDERS" | "FORWARD_TO" | "ROUTE_ADDRESS"> & {
	ALLOWED_SENDERS: string;
	FORWARD_TO: string;
	ROUTE_ADDRESS: string;
};

function createMessage(from = "trusted@partner.example") {
	const forward = vi.fn<ForwardableEmailMessage["forward"]>();
	const setReject = vi.fn<ForwardableEmailMessage["setReject"]>();

	return {
		message: {
			from,
			to: "support@company.example",
			forward,
			setReject,
		} as unknown as ForwardableEmailMessage,
		forward,
		setReject,
	};
}

function createEnv(overrides: Partial<TestEnv> = {}): Env {
	return {
		ASSETS: {} as Fetcher,
		ALLOWED_SENDERS: "trusted@partner.example",
		FORWARD_TO: "owner@mailbox.example",
		ROUTE_ADDRESS: "support@company.example",
		...overrides,
	} as TestEnv as Env;
}

function htmlAssets(html: string): Fetcher {
	return {
		fetch: vi.fn(() =>
			Promise.resolve(
				new Response(html, { headers: { "Content-Type": "text/html" } }),
			),
		),
	} as unknown as Fetcher;
}

describe("Email Routing Worker", () => {
	it("serves setup guidance", async () => {
		const response = await SELF.fetch("https://example.com");

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		const html = await response.text();
		expect(html).toContain("Email Routing starter");
		expect(html).toContain("configuration-warning");
	});

	it("renders configured addresses without exposing the allowlist", async () => {
		const response = await worker.fetch(
			new Request("https://worker.test/"),
			createEnv({
				ALLOWED_SENDERS: "private-sender@test.invalid",
				ASSETS: htmlAssets(`
					<span id="route-address"></span>
					<span id="forward-to"></span>
					<span id="allowed-senders-state"></span>
					<div id="configuration-warning">Configure</div>
				`),
				FORWARD_TO: "destination@test.invalid",
				ROUTE_ADDRESS: "support@test.invalid",
			}),
		);
		const html = await response.text();

		expect(html).toContain("support@test.invalid");
		expect(html).toContain("destination@test.invalid");
		expect(html).toContain("Configured");
		expect(html).not.toContain("private-sender@test.invalid");
		expect(html).not.toContain("configuration-warning");
	});

	it("forwards email from an allowed sender", async () => {
		const { message, forward, setReject } = createMessage();

		await handleEmail(message, createEnv());

		expect(forward).toHaveBeenCalledWith("owner@mailbox.example");
		expect(setReject).not.toHaveBeenCalled();
	});

	it("normalizes comma-separated sender addresses", async () => {
		const { message, forward } = createMessage("SECOND@EXAMPLE.COM");

		await handleEmail(
			message,
			createEnv({
				ALLOWED_SENDERS: " first@example.com, second@example.com ",
			}),
		);

		expect(forward).toHaveBeenCalledOnce();
	});

	it("rejects email from an unknown sender", async () => {
		const { message, forward, setReject } = createMessage(
			"unknown@example.com",
		);

		await handleEmail(message, createEnv());

		expect(setReject).toHaveBeenCalledWith("Sender is not allowed");
		expect(forward).not.toHaveBeenCalled();
	});

	it("rejects email when the destination is missing", async () => {
		const { message, forward, setReject } = createMessage();

		await handleEmail(message, createEnv({ FORWARD_TO: " " }));

		expect(setReject).toHaveBeenCalledWith("Email routing is not configured");
		expect(forward).not.toHaveBeenCalled();
	});

	it("rejects email when the sender allowlist is empty", async () => {
		const { message, forward, setReject } = createMessage();

		await handleEmail(message, createEnv({ ALLOWED_SENDERS: " , " }));

		expect(setReject).toHaveBeenCalledWith("Email routing is not configured");
		expect(forward).not.toHaveBeenCalled();
	});

	it("propagates forwarding failures", async () => {
		const { message, forward } = createMessage();
		forward.mockRejectedValue(new Error("forward failed"));

		await expect(handleEmail(message, createEnv())).rejects.toThrow(
			"forward failed",
		);
	});
});

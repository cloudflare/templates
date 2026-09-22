import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/index";

type TestEnv = Omit<Env, "FROM_ADDRESS" | "TO_ADDRESS"> & {
	FROM_ADDRESS: string;
	TO_ADDRESS: string;
};

const send = vi.fn<SendEmail["send"]>();

function createEnv(overrides: Partial<TestEnv> = {}): Env {
	return {
		ASSETS: {
			fetch: vi.fn(() =>
				Response.json({ error: "Not found" }, { status: 404 }),
			),
		} as unknown as Fetcher,
		EMAIL: { send } as SendEmail,
		FROM_ADDRESS: "notifications@test.invalid",
		SEND_EMAIL_AUTH_TOKEN: "test-token",
		TO_ADDRESS: "recipient@test.invalid",
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

function request(path: string, init?: RequestInit): Request {
	return new Request(`https://example.com${path}`, init);
}

describe("Email Sending Worker", () => {
	beforeEach(() => {
		send.mockReset();
		send.mockResolvedValue({ messageId: "message-id" });
	});

	it("serves setup guidance", async () => {
		const response = await SELF.fetch("https://example.com");

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		const html = await response.text();
		expect(html).toContain("Email Sending starter");
	});

	it("renders the configured sender and endpoint without a warning", async () => {
		const response = await handleRequest(
			request("/"),
			createEnv({
				ASSETS: htmlAssets(`
					<span id="from-address"></span>
					<span id="to-address"></span>
					<span id="send-endpoint"></span>
					<div id="configuration-warning">Configure</div>
				`),
				FROM_ADDRESS: "sender@test.invalid",
			}),
		);
		const html = await response.text();

		expect(html).toContain("sender@test.invalid");
		expect(html).toContain("recipient@test.invalid");
		expect(html).toContain("https://example.com/send");
		expect(html).not.toContain("configuration-warning");
	});

	it("shows a warning for placeholder addresses", async () => {
		const response = await handleRequest(
			request("/"),
			createEnv({
				ASSETS: htmlAssets(`
					<span id="from-address"></span>
					<span id="to-address"></span>
					<span id="send-endpoint"></span>
					<div id="configuration-warning">Configure</div>
				`),
				FROM_ADDRESS: "notifications@company.example",
				TO_ADDRESS: "recipient@mailbox.example",
			}),
		);
		const html = await response.text();

		expect(html).toContain("configuration-warning");
	});

	it("returns 404 for unknown routes", async () => {
		const response = await handleRequest(request("/unknown"), createEnv());

		expect(response.status).toBe(404);
	});

	it("allows only POST requests on the send endpoint", async () => {
		const response = await handleRequest(request("/send"), createEnv());

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("POST");
	});

	it("rejects requests without a bearer token", async () => {
		const response = await handleRequest(
			request("/send", { method: "POST" }),
			createEnv(),
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toBe("Bearer");
		expect(send).not.toHaveBeenCalled();
	});

	it("rejects an incorrect bearer token", async () => {
		const response = await handleRequest(
			request("/send", {
				method: "POST",
				headers: { authorization: "Bearer incorrect" },
			}),
			createEnv(),
		);

		expect(response.status).toBe(401);
		expect(send).not.toHaveBeenCalled();
	});

	it("fails closed when the authentication secret is missing", async () => {
		const response = await handleRequest(
			request("/send", { method: "POST" }),
			createEnv({ SEND_EMAIL_AUTH_TOKEN: "" }),
		);

		expect(response.status).toBe(503);
		expect(send).not.toHaveBeenCalled();
	});

	it("fails closed when example addresses have not been replaced", async () => {
		const response = await handleRequest(
			request("/send", {
				method: "POST",
				headers: { authorization: "Bearer test-token" },
			}),
			createEnv({ FROM_ADDRESS: "notifications@company.example" }),
		);

		expect(response.status).toBe(503);
		expect(send).not.toHaveBeenCalled();
	});

	it("sends only to the configured addresses", async () => {
		const response = await handleRequest(
			request("/send", {
				method: "POST",
				headers: { authorization: "Bearer test-token" },
				body: JSON.stringify({
					from: "attacker@example.com",
					to: "victim@example.com",
				}),
			}),
			createEnv(),
		);

		expect(response.status).toBe(200);
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				from: "notifications@test.invalid",
				to: "recipient@test.invalid",
			}),
		);
		await expect(response.json()).resolves.toEqual({
			success: true,
			messageId: "message-id",
		});
	});

	it("returns a sanitized error when sending fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		send.mockRejectedValue(new Error("provider details"));

		const response = await handleRequest(
			request("/send", {
				method: "POST",
				headers: { authorization: "Bearer test-token" },
			}),
			createEnv(),
		);

		expect(response.status).toBe(502);
		await expect(response.json()).resolves.toEqual({
			error: "Email could not be sent",
		});
		consoleError.mockRestore();
	});
});

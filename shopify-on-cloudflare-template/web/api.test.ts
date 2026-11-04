import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedFetch } from "./api";

describe("createAuthenticatedFetch", () => {
	it("authenticates with the App Bridge 4 idToken API", async () => {
		const idToken = vi.fn().mockResolvedValue("session-token");
		const fetchImpl = vi.fn().mockResolvedValue(new Response("{}"));
		const authenticatedFetch = createAuthenticatedFetch({ idToken }, fetchImpl);

		await authenticatedFetch("/api/example", {
			headers: { Accept: "application/json" },
		});

		expect(idToken).toHaveBeenCalledOnce();
		expect(fetchImpl).toHaveBeenCalledOnce();
		const [uri, init] = fetchImpl.mock.calls[0];
		const headers = new Headers(init?.headers);
		expect(uri).toBe("/api/example");
		expect(headers.get("Accept")).toBe("application/json");
		expect(headers.get("Authorization")).toBe("Bearer session-token");
	});
});

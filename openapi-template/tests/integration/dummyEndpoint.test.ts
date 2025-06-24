import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Dummy API Integration Tests", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe("POST /dummy/{slug}", () => {
    it("should return the log details", async () => {
      const slug = "test-slug";
      const requestBody = { name: "Test Name" };
      const response = await SELF.fetch(`http://local.test/dummy/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const body = await response.json<{ success: boolean; result: any }>();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.result.slug).toBe(slug);
      expect(body.result.name).toBe(requestBody.name);
      expect(body.result).toHaveProperty("msg");
    });
  });
});

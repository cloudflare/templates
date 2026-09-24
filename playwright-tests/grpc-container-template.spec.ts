import { test, expect } from "./fixtures";

test("explains the gRPC Container architecture", async ({
	page,
	templateUrl,
}) => {
	await page.goto(templateUrl);

	await expect(
		page.getByRole("heading", {
			level: 1,
			name: "Stream gRPC through a Worker.",
		}),
	).toBeVisible();
	await expect(page.getByText("Worker connect()")).toBeVisible();
	await expect(page.getByText("Durable Object connect()")).toBeVisible();
	await expect(
		page.getByRole("listitem").filter({ hasText: "ByteStream.Chat" }),
	).toBeVisible();
});

test("reports the local gRPC connection metadata", async ({
	request,
	templateUrl,
}) => {
	const response = await request.get(`${templateUrl}/api/status`);

	expect(response.status()).toBe(200);
	await expect(response.json()).resolves.toMatchObject({
		name: "gRPC Container",
		protocol: "gRPC over raw TCP",
		localGrpcAddress: "127.0.0.1:8788",
		containerPort: 50051,
	});
});

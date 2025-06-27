import { test, expect } from "./fixtures";

test.describe("R2 Explorer Template", () => {
  test("should work as expected", async ({ page, templateUrl }) => {
    await page.goto(templateUrl);
    await expect(page.getByText("R2-Explorer")).toBeVisible();
    await expect(page.getByText("bucketBucketarrow_drop_down")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "This folder is empty" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Read only" })).toBeVisible();
    await page.getByRole("button", { name: "Info" }).click();
    await expect(page.getByText("🎉 Thank you for using R2-")).toBeVisible();
    await page.getByRole("button", { name: "OK" }).click();
  });
});

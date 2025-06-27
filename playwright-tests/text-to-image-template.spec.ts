import { test, expect } from "./fixtures";

test.describe("Text to Image Template", () => {
  test("should render as expected", async ({ page, templateUrl }) => {
    await page.goto(templateUrl);
    await expect(page.getByRole("img")).toBeVisible();
  });
});

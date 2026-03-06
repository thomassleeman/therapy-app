import { expect, test } from "../../fixtures";

test.describe("Model Selector", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("displays a model selector button", async ({ page }) => {
    const modelButton = page
      .locator("button")
      .filter({ hasText: /Claude/i })
      .first();
    await expect(modelButton).toBeVisible();
  });

  test("opens model selector and shows Anthropic models", async ({ page }) => {
    const modelButton = page
      .locator("button")
      .filter({ hasText: /Claude/i })
      .first();
    await modelButton.click();

    await expect(page.getByPlaceholder("Search models...")).toBeVisible();
    await expect(page.getByText("Anthropic")).toBeVisible();
  });

  test("can close model selector with Escape", async ({ page }) => {
    const modelButton = page
      .locator("button")
      .filter({ hasText: /Claude/i })
      .first();
    await modelButton.click();

    await expect(page.getByPlaceholder("Search models...")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
  });
});

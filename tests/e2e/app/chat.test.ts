import { expect, test } from "../../fixtures";

const AI_STREAM_RESPONSE = `0:"Hello, I'm here to help with your reflection."\n`;

test.describe("Chat Page", () => {
  test("chat page loads with input field", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("multimodal-input")).toBeVisible();
  });

  test("can type in the input field", async ({ page }) => {
    await page.goto("/");
    const input = page.getByTestId("multimodal-input");
    await input.fill("Hello world");
    await expect(input).toHaveValue("Hello world");
  });

  test("submit button is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("send-button")).toBeVisible();
  });

  test("input clears after sending", async ({ page, mockApi }) => {
    await mockApi.chat(page, [AI_STREAM_RESPONSE]);
    await page.goto("/");

    const input = page.getByTestId("multimodal-input");
    await input.fill("Test message");
    await page.getByTestId("send-button").click();

    await expect(input).toHaveValue("");
  });

  test("sent message appears in chat", async ({ page, mockApi }) => {
    await mockApi.chat(page, [AI_STREAM_RESPONSE]);
    await page.goto("/");

    const input = page.getByTestId("multimodal-input");
    await input.fill("Hello");
    await page.getByTestId("send-button").click();

    // User message should appear
    const userMessage = page.locator("[data-role='user']").first();
    await expect(userMessage).toBeVisible();
    await expect(userMessage).toContainText("Hello");

    // Assistant message should appear
    const assistantMessage = page.locator("[data-role='assistant']").first();
    await expect(assistantMessage).toBeVisible();
  });

  test("stop button appears during generation", async ({ page }) => {
    // Use a delayed response that doesn't resolve immediately
    let resolveResponse: (() => void) | undefined;
    const responsePromise = new Promise<void>((resolve) => {
      resolveResponse = resolve;
    });

    await page.route("**/api/chat", async (route) => {
      await responsePromise;
      await route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: AI_STREAM_RESPONSE,
      });
    });

    await page.goto("/");
    await page.getByTestId("multimodal-input").fill("Hello");
    await page.getByTestId("send-button").click();

    const stopButton = page.getByTestId("stop-button");
    await expect(stopButton).toBeVisible({ timeout: 5000 });

    // Resolve so the route handler completes and doesn't leak
    resolveResponse?.();
  });

  test("chat redirects to /chat/[id]", async ({ page, mockApi }) => {
    await mockApi.chat(page, [AI_STREAM_RESPONSE]);
    await page.goto("/");

    await page.getByTestId("multimodal-input").fill("Hello");
    await page.getByTestId("send-button").click();

    await expect(page).toHaveURL(/\/chat\/[\w-]+/, { timeout: 10_000 });
  });

  test("handles API error gracefully", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.goto("/");
    await page.getByTestId("multimodal-input").fill("Test error");
    await page.getByTestId("send-button").click();

    await expect(
      page.getByText(/error|failed|trouble/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Chat Input Features", () => {
  test("input supports multiline text", async ({ page }) => {
    await page.goto("/");
    const input = page.getByTestId("multimodal-input");
    await input.fill("Line 1\nLine 2\nLine 3");
    await expect(input).toContainText("Line 1");
  });
});

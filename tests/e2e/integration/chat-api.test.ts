import { expect, test } from "@playwright/test";

test.skip(
  !process.env.E2E_INTEGRATION,
  "Skipped: set E2E_INTEGRATION=true to run",
);

const UUID_REGEX =
  /\/chat\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

test.describe("Chat API Integration", () => {
  test.describe.configure({ timeout: 60_000 });

  test("sends a therapy reflection message and receives a non-empty AI response", async ({
    page,
  }) => {
    await page.goto("/");

    const input = page.getByTestId("multimodal-input");
    await expect(input).toBeVisible();
    await input.fill("Hello, I'd like to reflect on a session");
    await page.getByTestId("send-button").click();

    // Wait for the assistant response to appear
    const assistantMessage = page.locator("[data-role='assistant']").first();
    await expect(assistantMessage).toBeVisible({ timeout: 60_000 });

    // Verify the response has meaningful content
    const content = await assistantMessage.textContent();
    expect(content?.length).toBeGreaterThan(0);
  });

  test("creates a new conversation with a valid UUID in the URL", async ({
    page,
  }) => {
    await page.goto("/");

    const input = page.getByTestId("multimodal-input");
    await expect(input).toBeVisible();
    await input.fill("Test conversation creation");
    await page.getByTestId("send-button").click();

    // Should redirect to /chat/<uuid>
    await expect(page).toHaveURL(UUID_REGEX, { timeout: 30_000 });
  });

  test("streaming response renders progressively", async ({ page }) => {
    await page.goto("/");

    const input = page.getByTestId("multimodal-input");
    await expect(input).toBeVisible();
    await input.fill(
      "Please provide a detailed reflection on how cognitive behavioural therapy techniques can be applied in a group setting with adolescents",
    );
    await page.getByTestId("send-button").click();

    // Wait for the assistant message container to appear
    const assistantMessage = page.locator("[data-role='assistant']").first();
    await expect(assistantMessage).toBeVisible({ timeout: 30_000 });

    // Capture initial length
    const initialLength =
      (await assistantMessage.textContent())?.length ?? 0;

    // Wait briefly and check the text has grown (streaming)
    await page.waitForTimeout(2000);
    const laterLength =
      (await assistantMessage.textContent())?.length ?? 0;

    expect(laterLength).toBeGreaterThan(initialLength);
  });

  test("stop generation halts the response", async ({ page }) => {
    await page.goto("/");

    const input = page.getByTestId("multimodal-input");
    await expect(input).toBeVisible();
    await input.fill(
      "Write a very long and detailed essay about every major therapeutic framework, including CBT, DBT, psychodynamic therapy, person-centred therapy, and existential therapy. Cover history, key concepts, techniques, and evidence base for each.",
    );
    await page.getByTestId("send-button").click();

    // Wait for the stop button to appear (streaming has started)
    const stopButton = page.getByTestId("stop-button");
    await expect(stopButton).toBeVisible({ timeout: 10_000 });

    // Let some content stream in
    await page.waitForTimeout(2000);

    // Click stop
    await stopButton.click();

    // Wait for stop button to disappear (generation stopped)
    await expect(stopButton).not.toBeVisible({ timeout: 10_000 });

    // Record the length after stopping
    const assistantMessage = page.locator("[data-role='assistant']").first();
    const stoppedLength =
      (await assistantMessage.textContent())?.length ?? 0;

    // Wait and verify the text hasn't grown
    await page.waitForTimeout(3000);
    const laterLength =
      (await assistantMessage.textContent())?.length ?? 0;

    expect(laterLength).toBe(stoppedLength);
  });

  test("recovers from error and allows subsequent messages", async ({
    page,
  }) => {
    await page.goto("/");

    const input = page.getByTestId("multimodal-input");
    await expect(input).toBeVisible();

    // Send an extremely long message to try to trigger an error
    const longMessage = "x".repeat(100_000);
    await input.fill(longMessage);
    await page.getByTestId("send-button").click();

    // Wait a moment for the error or response
    await page.waitForTimeout(5000);

    // Regardless of whether an error occurred, send a normal follow-up message
    // Navigate to a fresh chat to ensure clean state
    await page.goto("/");
    await expect(input).toBeVisible();
    await input.fill("Hello, simple test message");
    await page.getByTestId("send-button").click();

    // Verify we get a valid response
    const assistantMessage = page.locator("[data-role='assistant']").first();
    await expect(assistantMessage).toBeVisible({ timeout: 60_000 });

    const content = await assistantMessage.textContent();
    expect(content?.length).toBeGreaterThan(0);
  });
});

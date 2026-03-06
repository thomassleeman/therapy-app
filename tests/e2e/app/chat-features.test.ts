import { expect, test } from "../../fixtures";

/**
 * AI SDK data stream format helper.
 * Format: `0:"text chunk"\n` for text parts.
 */
function streamChunk(text: string): string {
  return `0:${JSON.stringify(text)}\n`;
}

const MARKDOWN_RESPONSE = streamChunk(
  "**Bold text** and a list:\n\n- Item one\n- Item two\n- Item three\n\nA second paragraph with *italic* text."
);

const SIMPLE_RESPONSE = streamChunk(
  "This is a mock assistant response for testing."
);

// ─── Message Display Tests ──────────────────────────────────────────────

test.describe("Message Display", () => {
  test("user message renders correctly", async ({ page, mockApi }) => {
    await mockApi.chat(page, [SIMPLE_RESPONSE]);
    await page.goto("/");

    const input = page.getByTestId("multimodal-input");
    await input.fill("Hello, I need to reflect on a session");
    await page.getByTestId("send-button").click();

    const userMessage = page.locator("[data-role='user']").first();
    await expect(userMessage).toBeVisible();
    await expect(userMessage).toContainText(
      "Hello, I need to reflect on a session"
    );
  });

  test("assistant message renders with markdown", async ({ page, mockApi }) => {
    await mockApi.chat(page, [MARKDOWN_RESPONSE]);
    await page.goto("/");

    await page.getByTestId("multimodal-input").fill("Test markdown");
    await page.getByTestId("send-button").click();

    const assistantMessage = page.locator("[data-role='assistant']").first();
    await expect(assistantMessage).toBeVisible();

    // Verify markdown rendered as HTML
    await expect(assistantMessage.locator("strong")).toContainText("Bold text");
    await expect(assistantMessage.locator("li")).toHaveCount(3);
    await expect(assistantMessage.locator("em")).toContainText("italic");
  });

  test("multiple messages in sequence", async ({ page }) => {
    const responses = [
      streamChunk("First response."),
      streamChunk("Second response."),
      streamChunk("Third response."),
    ];
    let callCount = 0;

    await page.route("**/api/chat", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: responses[callCount++] ?? responses[0],
      });
    });

    await page.goto("/");

    // Exchange 1
    await page.getByTestId("multimodal-input").fill("Message one");
    await page.getByTestId("send-button").click();
    await expect(page.locator("[data-role='assistant']").first()).toBeVisible();

    // Wait for ready state before sending next message
    await expect(page.getByTestId("send-button")).toBeVisible({
      timeout: 10_000,
    });

    // Exchange 2
    await page.getByTestId("multimodal-input").fill("Message two");
    await page.getByTestId("send-button").click();
    await expect(page.locator("[data-role='user']")).toHaveCount(2, {
      timeout: 10_000,
    });

    // Exchange 3
    await expect(page.getByTestId("send-button")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("multimodal-input").fill("Message three");
    await page.getByTestId("send-button").click();
    await expect(page.locator("[data-role='user']")).toHaveCount(3, {
      timeout: 10_000,
    });

    // Verify all messages appear in order
    const userMessages = page.locator("[data-role='user']");
    await expect(userMessages.nth(0)).toContainText("Message one");
    await expect(userMessages.nth(1)).toContainText("Message two");
    await expect(userMessages.nth(2)).toContainText("Message three");
  });

  test("long messages are scrollable", async ({ page, mockApi }) => {
    const longText = Array.from(
      { length: 100 },
      (_, i) =>
        `Paragraph ${i + 1}. This is a long response to test scrolling behavior.`
    ).join("\n\n");

    await mockApi.chat(page, [streamChunk(longText)]);
    await page.goto("/");

    await page.getByTestId("multimodal-input").fill("Give me a long response");
    await page.getByTestId("send-button").click();

    await expect(page.locator("[data-role='assistant']").first()).toBeVisible();

    // The messages container (absolute inset-0 overflow-y-auto) should be scrollable
    const scrollContainer = page.locator(".overflow-y-auto").first();
    const isScrollable = await scrollContainer.evaluate(
      (el) => el.scrollHeight > el.clientHeight
    );
    expect(isScrollable).toBe(true);
  });
});

// ─── Message Action Tests ───────────────────────────────────────────────

test.describe("Message Actions", () => {
  test("copy button appears on assistant message", async ({
    page,
    mockApi,
  }) => {
    await mockApi.chat(page, [SIMPLE_RESPONSE]);
    await page.goto("/");

    await page.getByTestId("multimodal-input").fill("Test");
    await page.getByTestId("send-button").click();

    const assistantMessage = page.locator("[data-role='assistant']").first();
    await expect(assistantMessage).toBeVisible();

    // Wait for streaming to finish so actions render (they return null while isLoading)
    await expect(page.getByTestId("send-button")).toBeVisible({
      timeout: 10_000,
    });

    // Hover to reveal action buttons
    await assistantMessage.hover();

    // Copy button should be visible (tooltip: "Copy")
    const copyButton = assistantMessage.getByRole("button", { name: /copy/i });
    await expect(copyButton).toBeVisible({ timeout: 5000 });
  });

  test("vote buttons appear on assistant message", async ({
    page,
    mockApi,
  }) => {
    await mockApi.chat(page, [SIMPLE_RESPONSE]);

    // Mock the vote API
    await page.route("**/api/vote*", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: "text/plain",
          body: "Message voted",
        });
      }
    });

    await page.goto("/");

    await page.getByTestId("multimodal-input").fill("Test");
    await page.getByTestId("send-button").click();

    // Wait for response to finish streaming
    await expect(page.getByTestId("send-button")).toBeVisible({
      timeout: 10_000,
    });

    const upvote = page.getByTestId("message-upvote").first();
    const downvote = page.getByTestId("message-downvote").first();

    await expect(upvote).toBeVisible({ timeout: 5000 });
    await expect(downvote).toBeVisible({ timeout: 5000 });
  });
});

// ─── Chat History Tests ─────────────────────────────────────────────────

test.describe("Chat History", () => {
  test("navigating to /chat/[id] loads existing chat", async ({
    page,
    mockApi,
  }) => {
    // First, create a chat by sending a message so we get a valid chat ID
    await mockApi.chat(page, [SIMPLE_RESPONSE]);
    await page.goto("/");

    await page.getByTestId("multimodal-input").fill("Initial message");
    await page.getByTestId("send-button").click();

    // Wait for redirect to /chat/[id]
    await expect(page).toHaveURL(/\/chat\/[\w-]+/, { timeout: 10_000 });

    // Capture the chat URL
    const chatUrl = page.url();

    // Navigate away and back
    await page.goto("/");
    await page.goto(chatUrl);

    // The chat page should load (it fetches from DB server-side)
    // If the chat exists, messages or input should be visible
    await expect(page.getByTestId("multimodal-input")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("new chat clears messages", async ({ page, mockApi }) => {
    await mockApi.chat(page, [SIMPLE_RESPONSE]);
    await page.goto("/");

    // Send a message to create some content
    await page.getByTestId("multimodal-input").fill("Hello");
    await page.getByTestId("send-button").click();

    await expect(page.locator("[data-role='user']").first()).toBeVisible();
    await expect(page.locator("[data-role='assistant']").first()).toBeVisible();

    // Navigate to new chat
    await page.goto("/");

    // Message area should be empty
    await expect(page.locator("[data-role='user']")).toHaveCount(0);
    await expect(page.locator("[data-role='assistant']")).toHaveCount(0);

    // Input should be ready
    await expect(page.getByTestId("multimodal-input")).toBeVisible();
    await expect(page.getByTestId("multimodal-input")).toHaveValue("");
  });
});

// ─── Error Handling Tests ───────────────────────────────────────────────

test.describe("Error Handling", () => {
  test("API error shows error message", async ({ page }) => {
    await page.route("**/api/chat", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.goto("/");

    await page.getByTestId("multimodal-input").fill("Test error handling");
    await page.getByTestId("send-button").click();

    // Should show an error indication (toast or inline message)
    await expect(
      page.getByText(/error|failed|trouble|something went wrong/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("network error handling", async ({ page }) => {
    await page.route("**/api/chat", (route) => {
      route.abort("connectionfailed");
    });

    await page.goto("/");

    await page.getByTestId("multimodal-input").fill("Test network error");
    await page.getByTestId("send-button").click();

    // Should show an error or the input should remain usable
    await expect(
      page.getByText(/error|failed|trouble|something went wrong/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});

// ─── Input Behaviour Tests ──────────────────────────────────────────────

test.describe("Input Behaviour", () => {
  test("Enter sends message", async ({ page, mockApi }) => {
    await mockApi.chat(page, [SIMPLE_RESPONSE]);
    await page.goto("/");

    const input = page.getByTestId("multimodal-input");
    await input.fill("Hello via Enter key");
    await input.press("Enter");

    // Input should clear (message was sent)
    await expect(input).toHaveValue("");

    // User message should appear
    await expect(page.locator("[data-role='user']").first()).toContainText(
      "Hello via Enter key"
    );
  });

  test("Shift+Enter adds new line", async ({ page }) => {
    await page.goto("/");

    const input = page.getByTestId("multimodal-input");
    await input.fill("Line one");
    await input.press("Shift+Enter");

    // Input should not be cleared (message was NOT sent)
    const value = await input.inputValue();
    expect(value).toContain("Line one");

    // No user message should appear
    await expect(page.locator("[data-role='user']")).toHaveCount(0);
  });

  test("empty input does not send", async ({ page }) => {
    let chatApiCalled = false;

    await page.route("**/api/chat", (route) => {
      chatApiCalled = true;
      route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: SIMPLE_RESPONSE,
      });
    });

    await page.goto("/");

    // Verify send button is disabled when input is empty
    const sendButton = page.getByTestId("send-button");
    await expect(sendButton).toBeDisabled();

    // Try pressing Enter with empty input
    const input = page.getByTestId("multimodal-input");
    await input.press("Enter");

    // No message should appear
    await expect(page.locator("[data-role='user']")).toHaveCount(0);
    expect(chatApiCalled).toBe(false);
  });
});

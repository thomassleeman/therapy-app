import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures";
import { mockClient } from "../../fixtures/mock-data";

const TEST_SESSION_ID = "test-session-id";

const mockClients = [
  mockClient,
  {
    ...mockClient,
    id: "client-002",
    name: "Test Client B",
    status: "active" as const,
  },
];

/**
 * Mock all APIs needed for the new-session page:
 * - GET /api/clients → client list
 * - POST /api/sessions → creates session returning { id } (called from step 2, not step 1)
 * - Sidebar APIs (history, clients) to prevent real fetches
 *
 * Note: /api/sessions/:id/consents is no longer called — consents are now
 * included in the POST /api/sessions body.
 */
async function mockAllApis(page: Page) {
  await page.route("**/api/clients*", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockClients),
      });
    }
    return route.fallback();
  });

  await page.route("**/api/sessions", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: TEST_SESSION_ID }),
      });
    }
    return route.fallback();
  });

  await page.route("**/api/history*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ chats: [], hasMore: false }),
    })
  );
}

/** Navigate to /sessions/new with all APIs mocked */
async function goToNewSession(page: Page) {
  await mockAllApis(page);
  await page.goto("/sessions/new");
  await expect(
    page.getByRole("heading", { name: "New Session" })
  ).toBeVisible();
}

/** Fill step 1 defaults and click Continue to advance to consent step (pure state transition) */
async function advanceToConsent(page: Page) {
  await goToNewSession(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("Recording & AI Processing Consent")
  ).toBeVisible();
}

/** Tick the single consent checkbox */
async function tickConsentCheckbox(page: Page) {
  await page.getByRole("checkbox").check();
}

// ─── Step 1: Session Details ─────────────────────────────────────────────────

test.describe("New Session — Step 1: Session Details", () => {
  test("page loads on step 1 with session details form", async ({ page }) => {
    await goToNewSession(page);

    await expect(page.getByLabel("Session Date")).toBeVisible();
    await expect(page.getByLabel("Client")).toBeVisible();
    await expect(page.getByText("Delivery Method")).toBeVisible();
    await expect(page.getByText("Record the full session")).toBeVisible();
    await expect(page.getByText("Record a summary")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("date defaults to today", async ({ page }) => {
    await goToNewSession(page);

    const today = new Date().toISOString().split("T")[0];
    await expect(page.locator("#session-date")).toHaveValue(today);
  });

  test("client dropdown populates from API", async ({ page }) => {
    await goToNewSession(page);

    // Open the select dropdown
    await page.locator("#client-select").click();

    await expect(
      page.getByRole("option", { name: "No client selected" })
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Test Client A" })
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Test Client B" })
    ).toBeVisible();
  });

  test("delivery method selection changes state", async ({ page }) => {
    await goToNewSession(page);

    // In-person is selected by default — its radio should be checked
    const inPerson = page.locator("label").filter({ hasText: "In-person" });
    const online = page.locator("label").filter({ hasText: "Online" });
    const telephone = page.locator("label").filter({ hasText: "Telephone" });

    // Click Online
    await online.click();
    await expect(online.locator("input[type='radio']")).toBeChecked();
    await expect(inPerson.locator("input[type='radio']")).not.toBeChecked();

    // Click Telephone
    await telephone.click();
    await expect(telephone.locator("input[type='radio']")).toBeChecked();
    await expect(online.locator("input[type='radio']")).not.toBeChecked();
  });

  test("recording type selection updates UI", async ({ page }) => {
    await goToNewSession(page);

    const fullSession = page.getByRole("button", {
      name: /Record the full session/,
    });
    const summary = page.getByRole("button", { name: /Record a summary/ });

    // Full session is default — verify it has the selected styling
    await expect(fullSession).toBeVisible();
    await expect(summary).toBeVisible();

    // Click summary
    await summary.click();

    // Click full session back
    await fullSession.click();
  });

  test("Continue button advances to consent without making an API call", async ({
    page,
  }) => {
    await goToNewSession(page);

    // Track whether POST /api/sessions was called
    let sessionCreated = false;
    await page.route("**/api/sessions", (route) => {
      if (route.request().method() === "POST") {
        sessionCreated = true;
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: TEST_SESSION_ID }),
        });
      }
      return route.fallback();
    });

    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByText("Recording & AI Processing Consent")
    ).toBeVisible();
    // Session creation is deferred to step 2 — no API call on Continue
    expect(sessionCreated).toBe(false);
  });
});

// ─── Step 2: Consent (Full Session) ──────────────────────────────────────────

test.describe("New Session — Step 2: Consent (Full Session)", () => {
  test("consent form shows a single confirmation checkbox", async ({
    page,
  }) => {
    await advanceToConsent(page);

    const checkboxes = page.getByRole("checkbox");
    await expect(checkboxes).toHaveCount(1);

    await expect(
      page.getByText(
        "I consent to the above, and I confirm that my client has given explicit verbal or written consent to the recording and AI processing of this session."
      )
    ).toBeVisible();
  });

  test("Proceed button is disabled initially", async ({ page }) => {
    await advanceToConsent(page);

    await expect(
      page.getByRole("button", { name: "Proceed to Recording" })
    ).toBeDisabled();
  });

  test("ticking the consent checkbox enables Proceed", async ({ page }) => {
    await advanceToConsent(page);

    await tickConsentCheckbox(page);

    await expect(
      page.getByRole("button", { name: "Proceed to Recording" })
    ).toBeEnabled();
  });

  test("Proceed creates session with consents and advances to recording step", async ({
    page,
  }) => {
    await advanceToConsent(page);

    // Override the /api/sessions mock to capture the request body
    let capturedBody: Record<string, unknown> | null = null;
    await page.route("**/api/sessions", (route) => {
      if (route.request().method() === "POST") {
        capturedBody = JSON.parse(route.request().postData() ?? "{}");
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: TEST_SESSION_ID }),
        });
      }
      return route.fallback();
    });

    await tickConsentCheckbox(page);
    await page.getByRole("button", { name: "Proceed to Recording" }).click();

    // Should advance to step 3
    await expect(
      page.getByText("Record or Upload Session Audio")
    ).toBeVisible();

    // POST /api/sessions should have been called with a consents array
    expect(capturedBody).not.toBeNull();
    const consents = (capturedBody as unknown as { consents?: unknown[] })
      .consents;
    expect(Array.isArray(consents)).toBe(true);
    // Full session: 4 consent types × 2 parties (therapist + client) = 8 records
    expect(consents?.length).toBe(8);
  });
});

// ─── Step 2: Consent (Therapist Summary) ─────────────────────────────────────

test.describe("New Session — Step 2: Consent (Therapist Summary)", () => {
  async function advanceToSummaryConsent(page: Page) {
    await goToNewSession(page);

    // Select therapist summary recording type
    await page.getByRole("button", { name: /Record a summary/ }).click();

    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("AI Processing Consent")).toBeVisible();
  }

  test("summary mode shows a single consent checkbox (therapist only)", async ({
    page,
  }) => {
    await advanceToSummaryConsent(page);

    const checkboxes = page.getByRole("checkbox");
    await expect(checkboxes).toHaveCount(1);

    await expect(
      page.getByText(
        "I consent to the recording and AI processing of my session summary as described above."
      )
    ).toBeVisible();
  });

  test("ticking consent checkbox enables Proceed in summary mode", async ({
    page,
  }) => {
    await advanceToSummaryConsent(page);

    await tickConsentCheckbox(page);

    await expect(
      page.getByRole("button", { name: "Proceed to Recording" })
    ).toBeEnabled();
  });

  test("Proceed creates session with therapist-only consents in summary mode", async ({
    page,
  }) => {
    await advanceToSummaryConsent(page);

    let capturedBody: Record<string, unknown> | null = null;
    await page.route("**/api/sessions", (route) => {
      if (route.request().method() === "POST") {
        capturedBody = JSON.parse(route.request().postData() ?? "{}");
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: TEST_SESSION_ID }),
        });
      }
      return route.fallback();
    });

    await tickConsentCheckbox(page);
    await page.getByRole("button", { name: "Proceed to Recording" }).click();

    await expect(
      page.getByText("Record or Upload Your Session Summary")
    ).toBeVisible();

    // Therapist summary: 4 consent types × 1 party (therapist only) = 4 records
    const consents = (capturedBody as unknown as { consents?: unknown[] })
      ?.consents;
    expect(Array.isArray(consents)).toBe(true);
    expect(consents?.length).toBe(4);
  });
});

// ─── Back Navigation ──────────────────────────────────────────────────────────

test.describe("New Session — Back Navigation", () => {
  test("Back from consent to details makes no API calls and preserves form state", async ({
    page,
  }) => {
    await advanceToConsent(page);

    let apiCalled = false;
    await page.route("**/api/sessions*", (route) => {
      apiCalled = true;
      return route.fallback();
    });

    await page.getByRole("button", { name: "Back" }).click();

    // Should be back on details step
    await expect(page.getByLabel("Session Date")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();

    // No API calls should have been made
    expect(apiCalled).toBe(false);
  });

  test("Back from write step to details makes no API calls", async ({
    page,
  }) => {
    await goToNewSession(page);

    // Select written notes
    await page.getByRole("button", { name: /Write session notes/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    // Should be on write step
    await expect(
      page.getByPlaceholder("Enter unformatted notes")
    ).toBeVisible();

    let apiCalled = false;
    await page.route("**/api/sessions*", (route) => {
      apiCalled = true;
      return route.fallback();
    });

    await page.getByRole("button", { name: "Back" }).click();

    // Should be back on details step
    await expect(page.getByLabel("Session Date")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();

    // No API calls should have been made
    expect(apiCalled).toBe(false);
  });

  test("Back to Consent button on record step returns to consent", async ({
    page,
  }) => {
    // Advance to record step via therapist summary (fewer clicks)
    await goToNewSession(page);
    await page.getByRole("button", { name: /Record a summary/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("AI Processing Consent")).toBeVisible();

    await tickConsentCheckbox(page);
    await page.getByRole("button", { name: "Proceed to Recording" }).click();
    await expect(
      page.getByText("Record or Upload Your Session Summary")
    ).toBeVisible();

    // Back to Consent button is shown before recording starts
    await page.getByRole("button", { name: "Back to Consent" }).click();

    // Should be back on the consent step
    await expect(page.getByText("AI Processing Consent")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Proceed to Recording" })
    ).toBeVisible();
  });
});

// ─── Step 3: Record / Upload ─────────────────────────────────────────────────

test.describe("New Session — Step 3: Record / Upload", () => {
  async function advanceToRecording(page: Page) {
    await advanceToConsent(page);
    await tickConsentCheckbox(page);
    await page.getByRole("button", { name: "Proceed to Recording" }).click();
    await expect(
      page.getByText("Record or Upload Session Audio")
    ).toBeVisible();
  }

  test("recording step shows Record and Upload tabs", async ({ page }) => {
    await advanceToRecording(page);

    await expect(
      page.getByRole("tab", { name: /Record Session/ })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Upload Recording/ })
    ).toBeVisible();
  });

  test("Record tab shows recorder component", async ({ page }) => {
    await advanceToRecording(page);

    await page.getByRole("tab", { name: /Record Session/ }).click();

    // SessionRecorder renders a "Start Recording" button in the ready phase
    await expect(
      page.getByRole("button", { name: "Start Recording" })
    ).toBeVisible();
  });

  test("Upload tab shows upload zone", async ({ page }) => {
    await advanceToRecording(page);

    await page.getByRole("tab", { name: /Upload Recording/ }).click();

    // AudioUpload shows the drag-and-drop text
    await expect(page.getByText(/Drag and drop an audio file/)).toBeVisible();
  });
});

// ─── Step Indicator ──────────────────────────────────────────────────────────

test.describe("New Session — Step Indicator", () => {
  test("step indicator shows all three steps for full session", async ({
    page,
  }) => {
    await goToNewSession(page);

    await expect(page.getByText("Session Details")).toBeVisible();
    // Step labels are hidden on mobile (sm:inline), but visible on default viewport
    await expect(page.getByText("Consent")).toBeVisible();
    await expect(page.getByText("Record / Upload")).toBeVisible();
  });

  test("step indicator shows two steps for written notes", async ({ page }) => {
    await goToNewSession(page);

    await page.getByRole("button", { name: /Write session notes/ }).click();

    await expect(page.getByText("Session Details")).toBeVisible();
    await expect(page.getByText("Write Notes")).toBeVisible();
    // Record / Upload step should not be shown
    await expect(page.getByText("Record / Upload")).not.toBeVisible();
  });

  test("step indicator updates when advancing", async ({ page }) => {
    await goToNewSession(page);

    // Step 1: "1" is shown in the circle, visible as current
    const stepCircles = page.locator(".rounded-full.flex.size-8");

    // Advance to consent step
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByText("Recording & AI Processing Consent")
    ).toBeVisible();

    // Step 1 should now show a checkmark (completed), step 2 should be current
    // The Check icon replaces the number for completed steps
    const firstCircle = stepCircles.first();
    await expect(firstCircle.locator("svg")).toBeVisible();
  });
});

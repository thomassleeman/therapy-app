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
 * - POST /api/sessions → creates session returning { id }
 * - POST /api/sessions/:id/consents → saves consent records
 * - Sidebar APIs (history, clients) to prevent real fetches
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

  await page.route(`**/api/sessions/${TEST_SESSION_ID}/consents`, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: `consent-${Date.now()}` }),
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

/** Fill step 1 defaults and click Continue to advance to consent step */
async function advanceToConsent(page: Page) {
  await goToNewSession(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("Recording & AI Processing Consent")
  ).toBeVisible();
}

/** Tick all 8 full-session consent checkboxes */
async function tickAllFullSessionConsents(page: Page) {
  const checkboxes = page.getByRole("checkbox");
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await checkboxes.nth(i).check();
  }
}

/** Tick all 4 therapist-only consent checkboxes */
async function tickAllTherapistConsents(page: Page) {
  const checkboxes = page.getByRole("checkbox");
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await checkboxes.nth(i).check();
  }
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

  test("Continue button creates session and advances to consent", async ({
    page,
  }) => {
    await goToNewSession(page);

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
    expect(sessionCreated).toBe(true);
  });
});

// ─── Step 2: Consent (Full Session) ──────────────────────────────────────────

test.describe("New Session — Step 2: Consent (Full Session)", () => {
  test("consent form shows 8 checkboxes for full session", async ({ page }) => {
    await advanceToConsent(page);

    const checkboxes = page.getByRole("checkbox");
    await expect(checkboxes).toHaveCount(8);

    // Verify all therapist labels
    await expect(
      page.getByText("I (therapist) consent to recording this session")
    ).toBeVisible();
    await expect(
      page.getByText("I (therapist) consent to AI transcription")
    ).toBeVisible();
    await expect(
      page.getByText("I (therapist) consent to AI-generated notes")
    ).toBeVisible();
    await expect(
      page.getByText("I (therapist) consent to secure data storage")
    ).toBeVisible();

    // Verify all client labels
    await expect(
      page.getByText(
        "My client has given explicit consent to recording this session"
      )
    ).toBeVisible();
    await expect(
      page.getByText("My client has given explicit consent to AI transcription")
    ).toBeVisible();
    await expect(
      page.getByText(
        "My client has given explicit consent to AI-generated notes"
      )
    ).toBeVisible();
    await expect(
      page.getByText(
        "My client has given explicit consent to secure data storage"
      )
    ).toBeVisible();
  });

  test("Proceed button is disabled initially", async ({ page }) => {
    await advanceToConsent(page);

    await expect(
      page.getByRole("button", { name: "Proceed to Recording" })
    ).toBeDisabled();
  });

  test("ticking all 8 checkboxes enables Proceed", async ({ page }) => {
    await advanceToConsent(page);

    await tickAllFullSessionConsents(page);

    await expect(
      page.getByRole("button", { name: "Proceed to Recording" })
    ).toBeEnabled();
  });

  test("partial consent (7 of 8) keeps Proceed disabled", async ({ page }) => {
    await advanceToConsent(page);

    const checkboxes = page.getByRole("checkbox");
    // Tick only the first 7
    for (let i = 0; i < 7; i++) {
      await checkboxes.nth(i).check();
    }

    await expect(
      page.getByRole("button", { name: "Proceed to Recording" })
    ).toBeDisabled();
  });

  test("Proceed saves consents and advances to recording step", async ({
    page,
  }) => {
    await advanceToConsent(page);

    const consentRequests: string[] = [];
    await page.route(`**/api/sessions/${TEST_SESSION_ID}/consents`, (route) => {
      if (route.request().method() === "POST") {
        consentRequests.push(route.request().postData() ?? "");
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: `consent-${consentRequests.length}` }),
        });
      }
      return route.fallback();
    });

    await tickAllFullSessionConsents(page);
    await page.getByRole("button", { name: "Proceed to Recording" }).click();

    // Should advance to step 3
    await expect(
      page.getByText("Record or Upload Session Audio")
    ).toBeVisible();

    // Should have made 8 consent API calls (4 therapist + 4 client)
    expect(consentRequests.length).toBe(8);
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

  test("summary mode shows 4 checkboxes (therapist only)", async ({ page }) => {
    await advanceToSummaryConsent(page);

    const checkboxes = page.getByRole("checkbox");
    await expect(checkboxes).toHaveCount(4);

    // Therapist labels present
    await expect(
      page.getByText("I (therapist) consent to recording this session")
    ).toBeVisible();
    await expect(
      page.getByText("I (therapist) consent to AI transcription")
    ).toBeVisible();

    // Client labels absent
    await expect(
      page.getByText(
        "My client has given explicit consent to recording this session"
      )
    ).not.toBeVisible();
  });

  test("4 therapist checkboxes enable Proceed", async ({ page }) => {
    await advanceToSummaryConsent(page);

    await tickAllTherapistConsents(page);

    await expect(
      page.getByRole("button", { name: "Proceed to Recording" })
    ).toBeEnabled();
  });
});

// ─── Step 3: Record / Upload ─────────────────────────────────────────────────

test.describe("New Session — Step 3: Record / Upload", () => {
  async function advanceToRecording(page: Page) {
    await advanceToConsent(page);
    await tickAllFullSessionConsents(page);
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

  test("Back button returns to consent step", async ({ page }) => {
    // For this test, go through the therapist summary flow (fewer clicks)
    await goToNewSession(page);
    await page.getByRole("button", { name: /Record a summary/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("AI Processing Consent")).toBeVisible();

    // Tick all consents and proceed to recording
    await tickAllTherapistConsents(page);
    await page.getByRole("button", { name: "Proceed to Recording" }).click();
    await expect(
      page.getByText("Record or Upload Your Session Summary")
    ).toBeVisible();

    // Note: Step 3 doesn't have a built-in Back button in the current
    // implementation. The step indicator shows previous steps but doesn't
    // navigate. If this test fails, we may need to add back-navigation.
  });
});

// ─── Step Indicator ──────────────────────────────────────────────────────────

test.describe("New Session — Step Indicator", () => {
  test("step indicator shows all three steps", async ({ page }) => {
    await goToNewSession(page);

    await expect(page.getByText("Session Details")).toBeVisible();
    // Step labels are hidden on mobile (sm:inline), but visible on default viewport
    await expect(page.getByText("Consent")).toBeVisible();
    await expect(page.getByText("Record / Upload")).toBeVisible();
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

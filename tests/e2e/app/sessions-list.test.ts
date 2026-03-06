import type { Page } from "@playwright/test";
import type { TherapySessionWithClient } from "@/lib/db/types";
import { expect, test } from "../../fixtures";
import { mockSession } from "../../fixtures/mock-data";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const baseSession: TherapySessionWithClient = {
  ...mockSession,
  clientName: "Test Client A",
};

function makeSession(
  overrides: Partial<TherapySessionWithClient>
): TherapySessionWithClient {
  return { ...baseSession, ...overrides };
}

const threeSessions: TherapySessionWithClient[] = [
  makeSession({
    id: "session-001",
    sessionDate: "2025-12-10",
    clientName: "Alice",
    transcriptionStatus: "completed",
  }),
  makeSession({
    id: "session-002",
    sessionDate: "2025-12-08",
    clientName: "Bob",
    transcriptionStatus: "pending",
  }),
  makeSession({
    id: "session-003",
    sessionDate: "2025-12-05",
    clientName: "Charlie",
    transcriptionStatus: "transcribing",
  }),
];

/**
 * Mock GET /api/sessions to return `{ sessions }`.
 * The built-in fixture returns a bare array, but `useSessions` expects
 * `{ sessions: TherapySessionWithClient[] }`.
 */
async function mockSessionsApi(
  page: Page,
  sessions: TherapySessionWithClient[]
) {
  await page.route("**/api/sessions", (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions }),
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe("Sessions List", () => {
  test("sessions page loads", async ({ page }) => {
    await mockSessionsApi(page, []);
    await page.goto("/sessions");

    await expect(page.getByText("Sessions")).toBeVisible();
  });

  test("shows session list with correct dates and client names", async ({
    page,
  }) => {
    await mockSessionsApi(page, threeSessions);
    await page.goto("/sessions");

    // Dates formatted as "10 Dec 2025" etc. (en-GB)
    await expect(page.getByText("10 Dec 2025")).toBeVisible();
    await expect(page.getByText("8 Dec 2025")).toBeVisible();
    await expect(page.getByText("5 Dec 2025")).toBeVisible();

    // Client names
    await expect(page.getByText("Alice")).toBeVisible();
    await expect(page.getByText("Bob")).toBeVisible();
    await expect(page.getByText("Charlie")).toBeVisible();
  });

  test("shows empty state when no sessions", async ({ page }) => {
    await mockSessionsApi(page, []);
    await page.goto("/sessions");

    await expect(page.getByText("No sessions yet")).toBeVisible();
    await expect(
      page.getByText("Record or upload your first session to get started.")
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Start Your First Session" })
    ).toBeVisible();
  });

  test("renders correct transcription status badges", async ({ page }) => {
    const sessions: TherapySessionWithClient[] = [
      makeSession({
        id: "s-completed",
        sessionDate: "2025-12-10",
        transcriptionStatus: "completed",
      }),
      makeSession({
        id: "s-transcribing",
        sessionDate: "2025-12-09",
        transcriptionStatus: "transcribing",
      }),
      makeSession({
        id: "s-pending",
        sessionDate: "2025-12-08",
        transcriptionStatus: "pending",
      }),
      makeSession({
        id: "s-failed",
        sessionDate: "2025-12-07",
        transcriptionStatus: "failed",
      }),
    ];

    await mockSessionsApi(page, sessions);
    await page.goto("/sessions");

    await expect(page.getByText("Completed")).toBeVisible();
    await expect(page.getByText("Transcribing")).toBeVisible();
    await expect(page.getByText("Pending")).toBeVisible();
    await expect(page.getByText("Failed")).toBeVisible();
  });

  test("New Session button navigates to /sessions/new", async ({ page }) => {
    await mockSessionsApi(page, []);
    await page.goto("/sessions");

    await page.getByRole("link", { name: "New Session" }).click();

    await expect(page).toHaveURL(/\/sessions\/new/, { timeout: 10_000 });
  });

  test("session date link navigates to session detail", async ({ page }) => {
    await mockSessionsApi(page, [
      makeSession({ id: "session-abc", sessionDate: "2025-12-10" }),
    ]);
    await page.goto("/sessions");

    await page.getByText("10 Dec 2025").click();

    await expect(page).toHaveURL(/\/sessions\/session-abc/, {
      timeout: 10_000,
    });
  });

  test("sessions are ordered newest first", async ({ page }) => {
    // Pass sessions in non-chronological order — the component should
    // render them in the order returned by the API (newest first).
    const sessions: TherapySessionWithClient[] = [
      makeSession({
        id: "s1",
        sessionDate: "2025-12-15",
        clientName: "Newest",
      }),
      makeSession({
        id: "s2",
        sessionDate: "2025-12-10",
        clientName: "Middle",
      }),
      makeSession({
        id: "s3",
        sessionDate: "2025-12-05",
        clientName: "Oldest",
      }),
    ];

    await mockSessionsApi(page, sessions);
    await page.goto("/sessions");

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(3);

    // First row should contain the newest date
    await expect(rows.nth(0)).toContainText("15 Dec 2025");
    await expect(rows.nth(1)).toContainText("10 Dec 2025");
    await expect(rows.nth(2)).toContainText("5 Dec 2025");
  });
});

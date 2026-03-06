import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures";

/**
 * Mock sidebar API calls so they don't depend on real data.
 * Dashboard content itself is server-rendered from DB queries,
 * so it reflects the actual test user's data.
 */
async function mockSidebarApis(page: Page) {
  await page.route("**/api/history*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ chats: [], hasMore: false }),
    }),
  );

  await page.route("**/api/clients*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    }),
  );
}

// ─── Page Load ──────────────────────────────────────────────────────────────────

test.describe("Dashboard page", () => {
  test("renders heading and welcome text", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(
      page.getByText("Welcome back. Here's an overview of your recent activity."),
    ).toBeVisible();
  });

  test("displays all main sections", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Recent Chats" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent Documents" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  });

  // ─── Empty State vs Populated ───────────────────────────────────────────────

  test("shows empty state or list for each section", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    // Recent Chats: either the empty message or at least one chat link
    const chatsSection = page.locator("section").filter({ hasText: "Recent Chats" });
    const hasChats = await chatsSection.locator("a[href^='/chat/']").count();

    if (hasChats > 0) {
      await expect(chatsSection.locator("a[href^='/chat/']").first()).toBeVisible();
    } else {
      await expect(
        chatsSection.getByText("No chats yet. Start a conversation to get going."),
      ).toBeVisible();
    }

    // Recent Documents: either the empty message or at least one document entry
    const docsSection = page.locator("section").filter({ hasText: "Recent Documents" });
    const hasDocs = await docsSection.locator(".truncate").count();

    if (hasDocs > 0) {
      await expect(docsSection.locator(".truncate").first()).toBeVisible();
    } else {
      await expect(
        docsSection.getByText(
          "No documents yet. Documents created during chats will appear here.",
        ),
      ).toBeVisible();
    }

    // Clients: either the empty message or at least one client card
    const clientsSection = page.locator("section").filter({ hasText: /^Clients/ });
    const hasClients = await clientsSection.locator("a[href^='/chat/new?clientId=']").count();

    if (hasClients > 0) {
      await expect(
        clientsSection.locator("a[href^='/chat/new?clientId=']").first(),
      ).toBeVisible();
    } else {
      await expect(
        clientsSection.getByText(
          "No clients yet. Add a client to start organizing your reflections.",
        ),
      ).toBeVisible();
    }
  });

  // ─── Quick Action Links ─────────────────────────────────────────────────────

  test("Start General Chat button navigates to new chat", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    const startChatLink = page.getByRole("link", { name: "Start General Chat" });
    await expect(startChatLink).toBeVisible();
    await startChatLink.click();

    await expect(page).toHaveURL("/chat/new?clientId=general");
  });

  test("View All Clients button navigates to clients page", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    const viewClientsLink = page.getByRole("link", { name: "View All Clients" });
    await expect(viewClientsLink).toBeVisible();
    await viewClientsLink.click();

    await expect(page).toHaveURL("/clients");
  });

  test("Add Client button opens client dialog", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    const addClientButton = page.getByRole("button", { name: "Add Client" });
    await expect(addClientButton).toBeVisible();
    await addClientButton.click();

    // The ClientDialog should appear as a dialog/modal
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("View all link in Recent Chats navigates to clients", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    const chatsSection = page.locator("section").filter({ hasText: "Recent Chats" });
    const viewAllLink = chatsSection.getByRole("link", { name: "View all" });
    await expect(viewAllLink).toBeVisible();
    await viewAllLink.click();

    await expect(page).toHaveURL("/clients");
  });

  test("Manage clients link navigates to clients page", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    const clientsSection = page.locator("section").filter({ hasText: /^Clients/ });
    const manageLink = clientsSection.getByRole("link", { name: "Manage clients" });
    await expect(manageLink).toBeVisible();
    await manageLink.click();

    await expect(page).toHaveURL("/clients");
  });
});

// ─── Responsive Layout ────────────────────────────────────────────────────────

test.describe("Dashboard responsive layout", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("renders correctly on mobile viewport", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    // Page heading is visible
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // No horizontal scrollbar — page width matches viewport
    const bodyScrollWidth = await page.evaluate(
      () => document.body.scrollWidth,
    );
    const viewportWidth = 375;
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth);
  });

  test("quick action buttons are visible on mobile", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: "Start General Chat" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Client" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View All Clients" }),
    ).toBeVisible();
  });

  test("all sections are visible on mobile", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Recent Chats" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent Documents" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  });
});

import { expect, test } from "../../fixtures";

// Mock chat history API response with sample chats
const MOCK_CHAT_HISTORY = {
  chats: [
    {
      id: "chat-1",
      title: "Session with Client A",
      createdAt: "2026-03-01T10:00:00Z",
      userId: "user-1",
      visibility: "private",
      clientId: null,
    },
    {
      id: "chat-2",
      title: "Reflection on CBT approach",
      createdAt: "2026-03-02T14:00:00Z",
      userId: "user-1",
      visibility: "private",
      clientId: null,
    },
  ],
  hasMore: false,
};

/**
 * Intercept sidebar-related API calls so tests don't depend on real data.
 */
async function mockSidebarApis(
  page: import("@playwright/test").Page,
  chatHistory = MOCK_CHAT_HISTORY
) {
  await page.route("**/api/history*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(chatHistory),
    })
  );

  await page.route("**/api/clients*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  );
}

// ─── Desktop Navigation ────────────────────────────────────────────────────────

test.describe("Desktop sidebar navigation", () => {
  test("sidebar is visible on page load", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    const sidebar = page.locator("[data-sidebar='sidebar']");
    await expect(sidebar).toBeVisible();
  });

  test("navigation links are present", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    const sidebar = page.locator("[data-sidebar='sidebar']");
    await expect(sidebar.getByText("Dashboard")).toBeVisible();
    await expect(sidebar.getByText("Clients")).toBeVisible();
    await expect(sidebar.getByText("Sessions")).toBeVisible();
  });

  test("Dashboard link navigates correctly", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/clients");

    const sidebar = page.locator("[data-sidebar='sidebar']");
    await sidebar.getByText("Dashboard").click();

    await expect(page).toHaveURL("/");
  });

  test("Clients link navigates correctly", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    const sidebar = page.locator("[data-sidebar='sidebar']");
    await sidebar.getByText("Clients").click();

    await expect(page).toHaveURL("/clients");
  });

  test("Sessions link navigates correctly", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    const sidebar = page.locator("[data-sidebar='sidebar']");
    await sidebar.getByText("Sessions").click();

    await expect(page).toHaveURL("/sessions");
  });

  test("active state highlighting on current route", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/clients");

    const sidebar = page.locator("[data-sidebar='sidebar']");
    const clientsButton = sidebar.locator(
      "[data-sidebar='menu-button']:has-text('Clients')"
    );

    await expect(clientsButton).toHaveAttribute("data-active", "true");

    // Dashboard should NOT be active
    const dashboardButton = sidebar.locator(
      "[data-sidebar='menu-button']:has-text('Dashboard')"
    );
    await expect(dashboardButton).toHaveAttribute("data-active", "false");
  });

  test("New Chat button navigates to new chat", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    // The PlusIcon button in the sidebar header — find by tooltip content
    const sidebar = page.locator("[data-sidebar='sidebar']");
    const newChatButton = sidebar.locator(
      "[data-sidebar='header'] button:has(svg)"
    );

    // The second button in the header is New Chat (first is Delete All)
    // Click the last button which is the "New Chat" one
    const buttons = newChatButton;
    const count = await buttons.count();
    await buttons.nth(count - 1).click();

    await expect(page).toHaveURL("/chat/new");
  });

  test("chat history appears in sidebar", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    const sidebar = page.locator("[data-sidebar='sidebar']");

    // Chats are grouped under "General" collapsible for uncategorized chats
    const generalTrigger = sidebar.getByText("General");
    await expect(generalTrigger).toBeVisible();

    // Expand the General section to see chat titles
    await generalTrigger.click();

    await expect(sidebar.getByText("Session with Client A")).toBeVisible();
    await expect(sidebar.getByText("Reflection on CBT approach")).toBeVisible();
  });
});

// ─── Mobile Navigation ─────────────────────────────────────────────────────────

test.describe("Mobile sidebar navigation", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("sidebar is hidden by default on mobile", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    // The nav links inside the sidebar should not be visible
    const sidebar = page.locator("[data-sidebar='sidebar']");
    await expect(sidebar.getByText("Dashboard")).not.toBeVisible();
  });

  test("hamburger menu opens sidebar", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    // Click the sidebar toggle button
    await page.getByTestId("sidebar-toggle-button").click();

    // Now nav links should be visible
    const sidebar = page.locator("[data-sidebar='sidebar']");
    await expect(sidebar.getByText("Dashboard")).toBeVisible();
    await expect(sidebar.getByText("Clients")).toBeVisible();
    await expect(sidebar.getByText("Sessions")).toBeVisible();
  });

  test("clicking a nav link closes mobile sidebar", async ({ page }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    // Open sidebar
    await page.getByTestId("sidebar-toggle-button").click();

    const sidebar = page.locator("[data-sidebar='sidebar']");
    await expect(sidebar.getByText("Clients")).toBeVisible();

    // Click a nav link
    await sidebar.getByText("Clients").click();

    // Sidebar should close — nav links hidden again
    await expect(sidebar.getByText("Dashboard")).not.toBeVisible();
    await expect(page).toHaveURL("/clients");
  });

  test("page content is accessible without opening sidebar", async ({
    page,
  }) => {
    await mockSidebarApis(page);
    await page.goto("/");

    // Main content area should be visible
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

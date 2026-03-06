import type { Client } from "@/lib/db/types";
import { expect, test } from "../../fixtures";
import { mockClient } from "../../fixtures/mock-data";

const mockClients: Client[] = [
  mockClient,
  {
    ...mockClient,
    id: "client-002",
    name: "Test Client B",
    status: "paused",
    presentingIssues: "Depression, low mood",
    therapeuticModalities: ["Person-Centred"],
    background: "Self-referred.",
    tags: ["depression"],
  },
  {
    ...mockClient,
    id: "client-003",
    name: "Test Client C",
    status: "discharged",
    presentingIssues: "Relationship difficulties",
    therapeuticModalities: ["Psychodynamic"],
    background: null,
    tags: [],
  },
];

const mockChatCounts = {
  counts: [
    { clientId: "client-001", count: 3 },
    { clientId: "client-002", count: 1 },
    { clientId: "client-003", count: 0 },
  ],
};

function mockChatCountsRoute(page: import("@playwright/test").Page) {
  return page.route("**/api/clients/chats", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockChatCounts),
    })
  );
}

test.describe("Client List", () => {
  test("clients page loads", async ({ page, mockApi }) => {
    await mockApi.clients(page, mockClients);
    await mockChatCountsRoute(page);

    await page.goto("/clients");

    await expect(page.getByText("Clients")).toBeVisible();
  });

  test("shows client list with all three clients", async ({
    page,
    mockApi,
  }) => {
    await mockApi.clients(page, mockClients);
    await mockChatCountsRoute(page);

    await page.goto("/clients");

    await expect(page.getByText("Test Client A")).toBeVisible();
    await expect(page.getByText("Test Client B")).toBeVisible();
    await expect(page.getByText("Test Client C")).toBeVisible();
  });

  test("shows empty state when no clients", async ({ page, mockApi }) => {
    await mockApi.clients(page, []);
    await mockChatCountsRoute(page);

    await page.goto("/clients");

    await expect(page.getByText("No clients yet")).toBeVisible();
    await expect(
      page.getByText("Add your first client to start organising")
    ).toBeVisible();
  });

  test("shows status badges for each client", async ({ page, mockApi }) => {
    await mockApi.clients(page, mockClients);
    await mockChatCountsRoute(page);

    await page.goto("/clients");

    // Status labels from CLIENT_STATUS_LABELS
    await expect(page.getByText("Active").first()).toBeVisible();
    await expect(page.getByText("Paused")).toBeVisible();
    await expect(page.getByText("Discharged")).toBeVisible();
  });

  test("shows client background text", async ({ page, mockApi }) => {
    await mockApi.clients(page, mockClients);
    await mockChatCountsRoute(page);

    await page.goto("/clients");

    await expect(
      page.getByText("Referred by GP for anxiety-related difficulties.")
    ).toBeVisible();
    await expect(page.getByText("Self-referred.")).toBeVisible();
  });
});

test.describe("Client Creation", () => {
  test.beforeEach(async ({ page, mockApi }) => {
    await mockApi.clients(page, mockClients);
    await mockChatCountsRoute(page);
    await page.goto("/clients");
  });

  test("add client button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Add Client" })
    ).toBeVisible();
  });

  test("add client dialog opens", async ({ page }) => {
    await page.getByRole("button", { name: "Add Client" }).click();

    await expect(page.getByText("Create Client")).toBeVisible();
    await expect(
      page.getByText("Add a new client to organize your chats.")
    ).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Status")).toBeVisible();
  });

  test("can fill in client form", async ({ page }) => {
    await page.getByRole("button", { name: "Add Client" }).click();

    const nameInput = page.getByLabel("Name");
    await nameInput.fill("New Client D");
    await expect(nameInput).toHaveValue("New Client D");
  });

  test("form validation — empty name shows error", async ({ page }) => {
    await page.getByRole("button", { name: "Add Client" }).click();

    // Name field should be empty by default, submit directly
    await page.getByRole("button", { name: "Create Client" }).click();

    // Toast error: "Client name is required"
    await expect(page.getByText("Client name is required")).toBeVisible({
      timeout: 5000,
    });
  });

  test("successful creation closes dialog", async ({ page }) => {
    const newClient: Client = {
      ...mockClient,
      id: "client-new",
      name: "New Client D",
    };

    // Mock the POST to /api/clients
    await page.route("**/api/clients", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(newClient),
        });
      }
      // Let GET requests through to existing mock
      return route.fallback();
    });

    await page.getByRole("button", { name: "Add Client" }).click();
    await page.getByLabel("Name").fill("New Client D");
    await page.getByRole("button", { name: "Create Client" }).click();

    // Dialog should close and success toast should appear
    await expect(page.getByText("Client created")).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("Client Interactions", () => {
  test.beforeEach(async ({ page, mockApi }) => {
    await mockApi.clients(page, mockClients);
    await mockChatCountsRoute(page);
    await page.goto("/clients");
  });

  test("can click into a client detail page", async ({ page }) => {
    await page.getByText("Test Client A").click();

    await expect(page).toHaveURL(/\/clients\/client-001/, {
      timeout: 10_000,
    });
  });

  test("edit button opens edit dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Edit Test Client A" }).click();

    await expect(page.getByText("Edit Client")).toBeVisible();
    // Name should be pre-filled
    await expect(page.getByLabel("Name")).toHaveValue("Test Client A");
  });

  test("delete button shows confirmation dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Delete Test Client A" }).click();

    await expect(page.getByText("Delete Test Client A?")).toBeVisible();
    await expect(page.getByText("This will delete the client")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete Client" })
    ).toBeVisible();
  });

  test("delete confirmation can be cancelled", async ({ page }) => {
    await page.getByRole("button", { name: "Delete Test Client A" }).click();

    await page.getByRole("button", { name: "Cancel" }).click();

    // Dialog should close
    await expect(page.getByText("Delete Test Client A?")).not.toBeVisible();
  });
});

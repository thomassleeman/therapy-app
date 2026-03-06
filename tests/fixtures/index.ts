import type { Page } from "@playwright/test";
import { test as base } from "@playwright/test";

interface MockApiFixture {
  /**
   * Intercept POST /api/chat and return a streaming mock response.
   * If `responses` is omitted, returns a single default assistant reply.
   */
  chat: (page: Page, responses?: string[]) => Promise<void>;

  /**
   * Intercept GET /api/sessions and return mock session data.
   */
  sessions: (page: Page, sessions?: Record<string, unknown>[]) => Promise<void>;

  /**
   * Intercept GET /api/clients and return mock client data.
   */
  clients: (page: Page, clients?: Record<string, unknown>[]) => Promise<void>;
}

export const test = base.extend<{ mockApi: MockApiFixture }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture pattern requires destructuring
  mockApi: async ({}, use) => {
    const mockApi: MockApiFixture = {
      async chat(page, responses) {
        const chunks = responses ?? [
          "This is a mock assistant response for testing.",
        ];
        const body = chunks.join("");

        await page.route("**/api/chat", (route) => {
          route.fulfill({
            status: 200,
            contentType: "text/plain; charset=utf-8",
            body,
          });
        });
      },

      async sessions(page, sessions) {
        const data = sessions ?? [];

        await page.route("**/api/sessions", (route) => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(data),
          });
        });
      },

      async clients(page, clients) {
        const data = clients ?? [];

        await page.route("**/api/clients", (route) => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(data),
          });
        });
      },
    };

    await use(mockApi);
  },
});

export { expect } from "@playwright/test";

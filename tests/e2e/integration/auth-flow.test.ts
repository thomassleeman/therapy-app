import { expect, test } from "@playwright/test";

test.skip(
  !process.env.E2E_INTEGRATION,
  "Skipped: set E2E_INTEGRATION=true to run",
);

test.describe("Auth Flow Integration", () => {
  test.describe.configure({ timeout: 60_000 });

  test("full sign-in flow with real credentials", async ({ browser }) => {
    // Use a fresh context without saved auth state
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto("/login");

      // Verify we're on the login page
      await expect(
        page.getByRole("heading", { name: "Sign in" }),
      ).toBeVisible();

      // Enter test credentials
      const email = process.env.E2E_USER_EMAIL;
      const password = process.env.E2E_USER_PASSWORD;

      if (!email || !password) {
        test.skip(true, "E2E_USER_EMAIL and E2E_USER_PASSWORD required");
        return;
      }

      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();

      // Wait for redirect away from login
      await page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 15_000,
      });

      // Verify user is authenticated — the user nav button shows their email
      const userNavButton = page.getByTestId("user-nav-button");
      await expect(userNavButton).toBeVisible({ timeout: 10_000 });

      const userEmail = page.getByTestId("user-email");
      await expect(userEmail).toHaveText(email);
    } finally {
      await context.close();
    }
  });

  test("sign-out flow redirects to login", async ({ browser }) => {
    // Start with a fresh context that has no saved auth
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const email = process.env.E2E_USER_EMAIL;
      const password = process.env.E2E_USER_PASSWORD;

      if (!email || !password) {
        test.skip(true, "E2E_USER_EMAIL and E2E_USER_PASSWORD required");
        return;
      }

      // Sign in first
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();

      await page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 15_000,
      });

      // Open user nav dropdown
      const userNavButton = page.getByTestId("user-nav-button");
      await expect(userNavButton).toBeVisible({ timeout: 10_000 });
      await userNavButton.click();

      // Click sign out
      const signOutItem = page.getByTestId("user-nav-item-auth");
      await expect(signOutItem).toBeVisible();
      await signOutItem.click();

      // Verify redirect to sign-in page
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
    } finally {
      await context.close();
    }
  });
});

import { expect, test } from "@playwright/test";

// Selectors verified against:
//   app/(auth-pages)/sign-in/page.tsx
//   app/(auth-pages)/sign-up/page.tsx
//   app/(auth-pages)/forgot-password/page.tsx

test.describe("Authentication Pages", () => {
  test.describe("Sign-in page", () => {
    test("renders correctly", async ({ page }) => {
      await page.goto("/sign-in");
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      await expect(page.getByText("Don't have an account?")).toBeVisible();
    });

    test("shows forgot password link", async ({ page }) => {
      await page.goto("/sign-in");
      const forgotLink = page.getByRole("link", { name: "Forgot Password?" });
      await expect(forgotLink).toBeVisible();
      await forgotLink.click();
      await expect(page).toHaveURL("/forgot-password");
    });

    // TODO: Add Google OAuth button to sign-in page, then enable this test.
    // Currently no OAuth button exists in app/(auth-pages)/sign-in/page.tsx.
    test.skip("shows Google OAuth button", async ({ page }) => {
      await page.goto("/sign-in");
      await expect(
        page.getByRole("button", { name: /sign in with google/i })
      ).toBeVisible();
    });

    test("empty form submission stays on sign-in page", async ({ page }) => {
      await page.goto("/sign-in");
      await page.getByRole("button", { name: "Sign in" }).click();
      // HTML required attributes prevent submission; page should not navigate
      await expect(page).toHaveURL(/\/sign-in/);
    });
  });

  test.describe("Sign-up page", () => {
    test("renders correctly", async ({ page }) => {
      await page.goto("/sign-up");
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
      await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Confirm Password")).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();
      await expect(page.getByText("Already have an account?")).toBeVisible();
    });
  });

  test.describe("Navigation between auth pages", () => {
    test("can navigate from sign-in to sign-up", async ({ page }) => {
      await page.goto("/sign-in");
      await page.getByRole("link", { name: "Sign up" }).click();
      await expect(page).toHaveURL("/sign-up");
    });

    test("can navigate from sign-up to sign-in", async ({ page }) => {
      await page.goto("/sign-up");
      await page.getByRole("link", { name: "Sign in" }).click();
      await expect(page).toHaveURL("/sign-in");
    });
  });
});

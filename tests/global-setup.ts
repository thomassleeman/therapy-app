import fs from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";

const AUTH_DIR = path.join(__dirname, ".auth");
const AUTH_FILE = path.join(AUTH_DIR, "user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  // Ensure the .auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  if (!email || !password) {
    console.warn(
      "[global-setup] E2E_USER_EMAIL or E2E_USER_PASSWORD not set. " +
        "Creating empty auth state — tests requiring authentication will fail."
    );
    fs.writeFileSync(
      AUTH_FILE,
      JSON.stringify({ cookies: [], origins: [] }),
      "utf-8"
    );
    return;
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Wait for navigation away from the login page
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });

  await page.context().storageState({ path: AUTH_FILE });
});

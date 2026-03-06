import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import { config } from "dotenv";

config({
  path: ".env.local",
});

/* Use process.env.PORT by default and fallback to port 3000 */
const PORT = process.env.PORT || 3000;

/**
 * Set webServer.url and use.baseURL with the location
 * of the WebServer respecting the correct set port
 */
const baseURL = `http://localhost:${PORT}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry once in CI to handle flaky tests */
  retries: process.env.CI ? 1 : 0,
  /* Limit workers to prevent browser crashes */
  workers: process.env.CI ? 2 : 2,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "retain-on-failure",
  },

  /* 30s default timeout for UI tests (was 240s — far too long) */
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },

  /* Configure projects */
  projects: [
    // ── Setup: authenticate once, save session state ──────────────────
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
    },

    // ── Auth pages: login/register — no authentication needed ─────────
    {
      name: "auth-pages",
      testMatch: /e2e\/auth\/.*\.test\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },

    // ── App: authenticated UI tests ───────────────────────────────────
    {
      name: "app",
      testMatch: /e2e\/app\/.*\.test\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/.auth/user.json",
      },
    },

    // ── Integration: tests that hit real APIs ─────────────────────────
    // These tests require E2E_INTEGRATION=true to run.
    //
    // Two approaches to skip when E2E_INTEGRATION is not set:
    //
    // 1. grep filter (project-level):
    //    Add `grep: /@integration/` here and tag tests with `test('... @integration', ...)`
    //    This skips tests at the runner level — they won't appear in reports at all.
    //
    // 2. test.skip (per-test):
    //    Use `test.skip(!process.env.E2E_INTEGRATION, 'Requires E2E_INTEGRATION')` at the
    //    top of each test. This marks them as "skipped" in reports — more visible.
    //
    // We use approach 2 (test.skip) as the default since it makes skipped tests visible
    // in reports. Tests in this project should include the skip guard.
    {
      name: "integration",
      testMatch: /e2e\/integration\/.*\.test\.ts/,
      dependencies: ["setup"],
      timeout: 120_000,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/.auth/user.json",
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "pnpm dev",
    url: `${baseURL}/ping`,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
});

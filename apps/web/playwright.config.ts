import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration.
 *
 * Both local and CI use `next start --port 3003` (production bundle).
 * globalSetup pre-warms the auth + proxy routes before tests start.
 *
 * Run: pnpm --filter web test:e2e
 * Prerequisites: Docker stack must be running (docker compose up -d api db redis)
 *                Run `pnpm --filter web build` before first run (or after code changes).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: require.resolve("./e2e/global-setup"),
  fullyParallel: false, // serial — tests share live DB state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],

  use: {
    baseURL: "http://localhost:3003",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // Always use the pre-built production bundle (zero compilation lag, no HMR cache issues).
    command: "pnpm next start --port 3003",
    // Wait for the auth CSRF route — this ensures NextAuth routes are compiled
    // and responding before any test starts.
    url: "http://localhost:3003/api/auth/csrf",
    reuseExistingServer: true, // CI starts the server before this step; locally reuse if already running
    timeout: 180_000, // generous: next dev cold-start on Windows can take 2-3 min
    env: {
      NEXTAUTH_URL: "http://localhost:3003",
      NEXTAUTH_SECRET: "e2e-dev-secret",
      NEXT_PUBLIC_API_URL: "http://localhost:8000",
      NEXT_PUBLIC_API_BASE_URL: "/api/proxy",
      NEXT_PUBLIC_ENABLE_SW: "false",
    },
  },
});

import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration.
 *
 * webServer starts `next dev --port 3001` with the required env vars and
 * forwards requests to the Docker API at localhost:8000.
 *
 * Run: pnpm --filter web test:e2e
 * Prerequisites: Docker stack must be running (docker compose up -d api db redis)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // serial — tests share live DB state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],

  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "pnpm next dev --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer: true, // don't restart if already running locally
    timeout: 120_000,
    env: {
      NEXTAUTH_URL: "http://localhost:3001",
      NEXTAUTH_SECRET: "e2e-dev-secret",
      NEXT_PUBLIC_API_URL: "http://localhost:8000",
      NEXT_PUBLIC_API_BASE_URL: "/api/proxy",
      NEXT_PUBLIC_ENABLE_SW: "false",
    },
  },
});

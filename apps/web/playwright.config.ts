import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: require.resolve("./e2e/global-setup"),
  fullyParallel: false,
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
    command: "pnpm next start --port 3003",
    url: "http://localhost:3003/api/auth/csrf",
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      NEXTAUTH_URL: "http://localhost:3003",
      NEXTAUTH_SECRET: "e2e-dev-secret",
      NEXT_PUBLIC_API_URL: "http://localhost:8000",
      NEXT_PUBLIC_API_BASE_URL: "/api/proxy",
      NEXT_PUBLIC_ENABLE_SW: "false",
    },
  },
});

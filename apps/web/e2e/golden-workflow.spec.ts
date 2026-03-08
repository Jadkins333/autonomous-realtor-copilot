/**
 * Golden workflow E2E tests.
 *
 * Exercises the full browser-level flow against a running Next.js dev server
 * and live Docker API:
 *
 *   login (wrong tenant → error) →
 *   login (valid) → dashboard →
 *   copilot command → agent trace badge visible →
 *   property list page accessible
 *
 * Prerequisites: Docker stack up (api + db + redis), playwright install done.
 * Run: pnpm --filter web test:e2e
 */

import { expect, Page, test } from "@playwright/test";

const TENANT_SLUG = "demo-realty";
const EMAIL = "agent@demo.local";
const PASSWORD = "demo123";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function signIn(
  page: Page,
  opts: { tenantSlug: string; email: string; password: string },
) {
  await page.goto("/login");
  await page.getByPlaceholder("Tenant slug").fill(opts.tenantSlug);
  await page.getByPlaceholder("Email").fill(opts.email);
  await page.getByPlaceholder("Password").fill(opts.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// ---------------------------------------------------------------------------
// Auth: tenant isolation
// ---------------------------------------------------------------------------

test.describe("auth: tenant-aware login", () => {
  test("wrong tenant slug shows error and stays on /login", async ({ page }) => {
    await signIn(page, {
      tenantSlug: "nonexistent-tenant",
      email: EMAIL,
      password: PASSWORD,
    });
    await expect(page.getByText("Invalid credentials")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("wrong password for real tenant shows error and stays on /login", async ({
    page,
  }) => {
    await signIn(page, {
      tenantSlug: TENANT_SLUG,
      email: EMAIL,
      password: "wrong-password",
    });
    await expect(page.getByText("Invalid credentials")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("valid demo credentials redirect to /dashboard", async ({ page }) => {
    await signIn(page, {
      tenantSlug: TENANT_SLUG,
      email: EMAIL,
      password: PASSWORD,
    });
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

// ---------------------------------------------------------------------------
// Golden workflow: login → copilot → trace
// ---------------------------------------------------------------------------

test.describe("golden workflow: login → copilot → trace", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, {
      tenantSlug: TENANT_SLUG,
      email: EMAIL,
      password: PASSWORD,
    });
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("copilot page loads with command input and Run button", async ({
    page,
  }) => {
    await page.goto("/copilot");
    // Use heading role to avoid matching nav link and agents link that also contain "Copilot"
    await expect(page.getByRole("heading", { name: "Copilot", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run" })).toBeVisible();
    await expect(page.getByRole("textbox")).toBeVisible();
  });

  test("copilot command returns agent trace badge", async ({ page }) => {
    await page.goto("/copilot");

    // Use a command the market snapshot agent handles deterministically
    await page.getByRole("textbox").fill("columbus market snapshot");
    await page.getByRole("button", { name: "Run" }).click();

    // Wait for the assistant response — badge shows "agent: <name>"
    const agentBadge = page.locator("text=/^agent:/");
    await expect(agentBadge).toBeVisible({ timeout: 25_000 });
  });

  test("copilot Trace section is expandable", async ({ page }) => {
    await page.goto("/copilot");
    await page.getByRole("textbox").fill("columbus market snapshot");
    await page.getByRole("button", { name: "Run" }).click();

    // Wait for response
    await expect(page.locator("text=/^agent:/")).toBeVisible({
      timeout: 25_000,
    });

    // Expand the Trace <details> — use exact match to avoid the subtitle paragraph
    // which contains "trace metadata" and also matches getByText("Trace")
    await page.getByText("Trace", { exact: true }).click();
    // Pre-formatted JSON should appear containing selected_agent
    await expect(page.locator("pre")).toBeVisible();
    const preText = await page.locator("pre").first().innerText();
    expect(preText).toContain("selected_agent");
  });

  test("property list page loads", async ({ page }) => {
    await page.goto("/properties");
    await expect(page.getByText("Properties")).toBeVisible({ timeout: 8_000 });
  });
});

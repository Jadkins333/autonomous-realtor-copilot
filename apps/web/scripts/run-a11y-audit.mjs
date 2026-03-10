import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";

const args = new Set(process.argv.slice(2));
const labelArg =
  process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const PORT = Number(portArg?.slice("--port=".length) ?? "3138");
const BASE_URL = `http://localhost:${PORT}`;
const LABEL = labelArg ?? "launch-a11y";
const START_SERVER = args.has("--start-server");

const OUT_DIR = "../../artifacts/verification";
const SCREENSHOT_DIR = "../../artifacts/redesign";
const PNPM_DIR = path.resolve(process.cwd(), "../../node_modules/.pnpm");
const ROUTES = [
  { name: "dashboard", path: "/dashboard", waitFor: "[data-testid='dashboard-page'], main" },
  { name: "contacts", path: "/contacts", waitFor: "[data-testid='contacts-table-card'], [data-testid='create-contact-card']" },
  { name: "contact-detail", path: "/contacts", dynamic: true, waitFor: "[data-testid='messages-table'], [data-testid='no-messages']" },
  { name: "properties", path: "/properties", waitFor: "[data-testid='property-results-card']" },
  { name: "property-detail", path: "/properties", dynamic: true, waitFor: "[data-testid='property-facts-card'], [data-testid='property-detail-error']" },
  { name: "opportunities", path: "/opportunities", waitFor: "[data-testid='opportunities-summary-card'], [data-testid='opportunities-loading']" },
  { name: "opportunities-events", path: "/opportunities/events", waitFor: "[data-testid='events-summary-card'], [data-testid='events-list']" },
  { name: "sequences", path: "/sequences", waitFor: "[data-testid^='sequence-card-'], [data-testid='empty-sequences']" },
  { name: "outreach", path: "/outreach", waitFor: "[data-testid='compose-card'], [data-testid='packs-card']" },
  { name: "copilot", path: "/copilot", waitFor: "[data-testid='llm-status-card'], [data-testid='chat-card']" },
  { name: "setup", path: "/setup", waitFor: "[data-testid='feature-card-llm'], [data-testid='diagnostics-pre']" },
  { name: "sources", path: "/sources", waitFor: "[data-testid^='source-card-'], [data-testid='loading-card']" },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
    } catch {
      // server still booting
    }
    await wait(1000);
  }
  throw new Error(`Server did not become ready: ${url}`);
}

function startServer() {
  return spawn(
    "C:\\PROGRA~1\\nodejs\\pnpm.CMD",
    ["next", "start", "--port", String(PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXTAUTH_URL: BASE_URL,
        NEXTAUTH_SECRET: "e2e-dev-secret",
        NEXT_PUBLIC_API_URL: "http://localhost:8000",
        NEXT_PUBLIC_API_BASE_URL: "/api/proxy",
        NEXT_PUBLIC_ENABLE_SW: "false",
      },
      stdio: "inherit",
      shell: true,
    },
  );
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function resolveAxeSourcePath() {
  const entries = await fs.readdir(PNPM_DIR, { withFileTypes: true });
  const axeDir = entries.find(
    (entry) => entry.isDirectory() && entry.name.startsWith("axe-core@"),
  );

  if (!axeDir) {
    throw new Error("Could not locate axe-core in the PNPM store.");
  }

  return path.join(
    PNPM_DIR,
    axeDir.name,
    "node_modules",
    "axe-core",
    "axe.min.js",
  );
}

async function signIn(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Tenant slug").fill("demo-realty");
  await page.getByPlaceholder("Email").fill("agent@demo.local");
  await page.getByPlaceholder("Password").fill("demo123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function resolveRoute(page, route) {
  if (!route.dynamic) {
    return `${BASE_URL}${route.path}`;
  }

  if (route.name === "property-detail") {
    await page.goto(`${BASE_URL}/properties`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid='property-search-btn']", { timeout: 20_000 });
    await page.getByTestId("property-search-btn").click();
    const locator = page
      .locator(
        "[data-testid^='property-card-'] a[href^='/properties/'], [data-testid^='property-row-'] a[href^='/properties/']",
      )
      .first();
    await locator.waitFor({ state: "attached", timeout: 20_000 });
    const href = await locator.getAttribute("href");

    if (!href) {
      throw new Error(`Could not resolve dynamic route for ${route.name}`);
    }

    return `${BASE_URL}${href}`;
  }

  await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "networkidle" });
  const locator = page.locator("a[href^='/contacts/']").first();
  await locator.waitFor({ state: "attached", timeout: 20_000 });
  const href = await locator.getAttribute("href");

  if (!href) {
    throw new Error(`Could not resolve dynamic route for ${route.name}`);
  }

  return `${BASE_URL}${href}`;
}

async function injectAxe(page) {
  const axeSourcePath = await resolveAxeSourcePath();
  const source = await fs.readFile(axeSourcePath, "utf8");
  await page.addScriptTag({ content: source });
}

async function runAxe(page, route) {
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "best-practice"],
      },
    });

    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    }));
  });

  return {
    route: route.name,
    path: route.path,
    violations,
  };
}

async function capture(page, routeName) {
  const target = path.join(SCREENSHOT_DIR, LABEL, `${routeName}.png`);
  await ensureDir(path.dirname(target));
  await page.screenshot({ path: target, fullPage: true });
}

async function captureResponsiveProof(browser) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });

  try {
    await signIn(page);

    for (const route of ROUTES.filter((item) =>
      [
        "properties",
        "property-detail",
        "opportunities",
        "opportunities-events",
        "sources",
      ].includes(item.name),
    )) {
      const targetUrl = await resolveRoute(page, route);
      await page.goto(targetUrl, { waitUntil: "networkidle" });
      await page.waitForSelector(route.waitFor, { timeout: 20_000 });
      const target = path.join(
        SCREENSHOT_DIR,
        LABEL,
        `${route.name}-mobile.png`,
      );
      await ensureDir(path.dirname(target));
      await page.screenshot({ path: target, fullPage: true });
    }
  } finally {
    await page.close();
  }
}

async function main() {
  const server = START_SERVER ? startServer() : null;

  if (server) {
    await waitForServer(`${BASE_URL}/api/auth/csrf`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });

  try {
    await signIn(page);

    const results = [];

    for (const route of ROUTES) {
      const targetUrl = await resolveRoute(page, route);
      await page.goto(targetUrl, { waitUntil: "networkidle" });
      await page.waitForSelector(route.waitFor, { timeout: 20_000 });
      await injectAxe(page);
      results.push(await runAxe(page, route));

      if (
        route.name === "properties" ||
        route.name === "property-detail" ||
        route.name === "opportunities" ||
        route.name === "opportunities-events" ||
        route.name === "sources"
      ) {
        await capture(page, route.name);
      }
    }

    await captureResponsiveProof(browser);

    const summary = {
      generated_at: new Date().toISOString(),
      base_url: BASE_URL,
      totals: {
        routes_scanned: results.length,
        violations: results.reduce((sum, route) => sum + route.violations.length, 0),
      },
      results,
    };

    const outPath = path.join(OUT_DIR, `${LABEL}.json`);
    await ensureDir(path.dirname(outPath));
    await fs.writeFile(outPath, JSON.stringify(summary, null, 2));

    const lines = [
      `A11y routes scanned: ${summary.totals.routes_scanned}`,
      `A11y violations: ${summary.totals.violations}`,
    ];

    for (const route of results) {
      if (route.violations.length === 0) {
        lines.push(`- ${route.route}: clean`);
        continue;
      }

      const violations = route.violations.map((violation) =>
        `${violation.id}${violation.impact ? ` (${violation.impact})` : ""}`,
      );
      lines.push(`- ${route.route}: ${violations.join(", ")}`);
    }

    console.log(lines.join("\n"));

    if (summary.totals.violations > 0) {
      process.exitCode = 1;
      return;
    }
  } finally {
    await page.close();
    await browser.close();
    if (server) {
      server.kill();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";

const args = new Set(process.argv.slice(2));
const labelArg =
  process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const PORT = Number(portArg?.slice("--port=".length) ?? "3100");
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = "../../artifacts/redesign";
const LABEL = labelArg ?? "capture";
const START_SERVER = args.has("--start-server");

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
  const child = spawn(
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
        NEXT_PUBLIC_ENABLE_SW: "false"
      },
      stdio: "inherit",
      shell: true
    }
  );

  return child;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function signIn(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Tenant slug").fill("demo-realty");
  await page.getByPlaceholder("Email").fill("agent@demo.local");
  await page.getByPlaceholder("Password").fill("demo123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function shot(page, relativePath, locator = null, options = {}) {
  const target = path.join(OUT_DIR, LABEL, relativePath);
  await ensureDir(path.dirname(target));
  if (locator) {
    await locator.screenshot({ path: target, ...options });
  } else {
    await page.screenshot({ path: target, fullPage: true, ...options });
  }
}

async function main() {
  const server = START_SERVER ? startServer() : null;

  if (server) {
    await waitForServer(`${BASE_URL}/api/auth/csrf`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 }
  });

  try {
    await signIn(page);

    await shot(page, "sidebar.png", page.locator("nav").first());
    await shot(page, "dashboard.png");

    await page.goto(`${BASE_URL}/contacts`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid='contacts-table-card']");
    await shot(page, "contacts.png");

    const firstContact = page.locator("tbody a").first();
    await firstContact.click();
    await page.waitForURL(/\/contacts\/.+/, { timeout: 20_000 });
    await page.waitForSelector(
      "[data-testid='messages-table'], [data-testid='no-messages']"
    );
    await shot(page, "contact-detail.png");

    await page.goto(`${BASE_URL}/sequences`, { waitUntil: "networkidle" });
    await page.waitForSelector(
      "[data-testid^='sequence-card-'], [data-testid='empty-sequences']"
    );
    await shot(page, "sequences.png");

    await page.goto(`${BASE_URL}/sources`, { waitUntil: "networkidle" });
    await page.waitForSelector(
      "[data-testid^='source-card-'], [data-testid='loading-card']"
    );
    await shot(page, "sources.png");
  } finally {
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

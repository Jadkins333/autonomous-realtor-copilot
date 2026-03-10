import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";

const args = new Set(process.argv.slice(2));
const labelArg =
  process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const PORT = Number(portArg?.slice("--port=".length) ?? "3122");
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = "../../artifacts/redesign";
const LABEL = labelArg ?? "polish-proof";
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

async function shot(page, relativePath, locator = null) {
  const target = path.join(OUT_DIR, LABEL, relativePath);
  await ensureDir(path.dirname(target));
  if (locator) {
    await locator.screenshot({ path: target });
  } else {
    await page.screenshot({ path: target, fullPage: true });
  }
}

async function signIn(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Tenant slug").fill("demo-realty");
  await page.getByPlaceholder("Email").fill("agent@demo.local");
  await page.getByPlaceholder("Password").fill("demo123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function captureContacts(page, output = "contacts.png") {
  await page.goto(`${BASE_URL}/contacts`, { waitUntil: "networkidle" });
  await page.waitForSelector(
    "[data-testid='contacts-table-card'], [data-testid='create-contact-card']",
  );
  await shot(page, output);
}

async function captureContactDetail(
  page,
  { mobile = false, output = "contact-detail.png" } = {},
) {
  await page.goto(`${BASE_URL}/contacts`, { waitUntil: "networkidle" });
  const contactHref = await page
    .locator("a[href^='/contacts/']")
    .first()
    .getAttribute("href");

  if (!contactHref) {
    throw new Error("Could not find a contact detail link to capture.");
  }

  await page.goto(`${BASE_URL}${contactHref}`, { waitUntil: "networkidle" });
  await page.waitForURL(/\/contacts\/.+/, { timeout: 20_000 });
  if (mobile) {
    await page.waitForSelector(
      "[data-testid^='message-card-'], [data-testid='no-messages']",
    );
  } else {
    await page.waitForSelector(
      "[data-testid='messages-table'], [data-testid='no-messages']",
    );
  }
  await shot(page, output);
}

async function captureOutreach(page, output = "outreach.png") {
  await page.goto(`${BASE_URL}/outreach`, { waitUntil: "networkidle" });
  await page.waitForSelector(
    "[data-testid='compose-card'], [data-testid='packs-card']",
  );
  await shot(page, output);
}

async function captureSequences(page, output = "sequences.png") {
  await page.goto(`${BASE_URL}/sequences`, { waitUntil: "networkidle" });
  await page.waitForSelector(
    "[data-testid^='sequence-card-'], [data-testid='empty-sequences']",
  );
  await shot(page, output);
}

async function captureCopilot(page, output = "copilot.png") {
  await page.goto(`${BASE_URL}/copilot`, { waitUntil: "networkidle" });
  await page.waitForSelector(
    "[data-testid='llm-status-card'], [data-testid='chat-card']",
  );
  await shot(page, output);
}

async function captureSetup(page, output = "setup.png") {
  await page.goto(`${BASE_URL}/setup`, { waitUntil: "networkidle" });
  await page.waitForSelector(
    "[data-testid='feature-card-llm'], [data-testid='diagnostics-pre']",
  );
  await shot(page, output);
}

async function captureMobile(browser) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });

  try {
    await signIn(page);

    await captureContacts(page, "contacts-mobile.png");
    await captureContactDetail(page, {
      mobile: true,
      output: "contact-detail-mobile.png",
    });
    await captureOutreach(page, "outreach-mobile.png");
    await captureSequences(page, "sequences-mobile.png");
    await captureSetup(page, "setup-mobile.png");
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
    await captureContacts(page);
    await captureContactDetail(page);
    await captureOutreach(page);
    await captureSequences(page);
    await captureCopilot(page);
    await captureSetup(page);
    await captureMobile(browser);
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

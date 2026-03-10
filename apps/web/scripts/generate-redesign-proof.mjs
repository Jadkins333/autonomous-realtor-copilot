import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";

const args = new Set(process.argv.slice(2));
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const PORT = Number(portArg?.slice("--port=".length) ?? "3104");
const BASE_URL = `http://localhost:${PORT}`;
const START_SERVER = args.has("--start-server");
const ROOT = path.resolve(process.cwd(), "../../");
const REDESIGN_DIR = path.join(ROOT, "artifacts", "redesign");
const RESPONSIVE_DIR = path.join(REDESIGN_DIR, "responsive");
const MONTAGE_HTML = path.join(REDESIGN_DIR, "montage.html");
const MONTAGE_PNG = path.join(REDESIGN_DIR, "montage.png");

const SCREENS = [
  { key: "sidebar", label: "Sidebar / Navigation" },
  { key: "dashboard", label: "Dashboard" },
  { key: "contacts", label: "Contacts" },
  { key: "contact-detail", label: "Contact Detail" },
  { key: "sequences", label: "Sequences" },
  { key: "sources", label: "Sources" }
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
        NEXT_PUBLIC_ENABLE_SW: "false"
      },
      stdio: "inherit",
      shell: true
    }
  );
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function fileUrl(...parts) {
  return pathToFileURL(path.join(...parts)).href;
}

async function buildMontageHtml() {
  const cards = SCREENS.map(({ key, label }) => {
    const before = fileUrl(REDESIGN_DIR, "before", `${key}.png`);
    const after = fileUrl(REDESIGN_DIR, "after", `${key}.png`);

    return `
      <section class="pair">
        <div class="pair-header">
          <div>
            <p class="eyebrow">Redesign Proof</p>
            <h2>${label}</h2>
          </div>
          <span class="delta">Before vs After</span>
        </div>
        <div class="columns">
          <figure>
            <figcaption>Before</figcaption>
            <img src="${before}" alt="${label} before redesign" />
          </figure>
          <figure>
            <figcaption>After</figcaption>
            <img src="${after}" alt="${label} after redesign" />
          </figure>
        </div>
      </section>
    `;
  }).join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Redesign Proof Montage</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(180, 222, 255, 0.45), transparent 30%),
          linear-gradient(180deg, #f7f5ef 0%, #f1efe9 100%);
        color: #19202a;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 48px;
      }

      .wrap {
        display: grid;
        gap: 28px;
      }

      .hero {
        display: grid;
        gap: 10px;
        padding: 28px 32px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(94, 113, 140, 0.14);
        box-shadow: 0 18px 44px rgba(19, 29, 44, 0.12);
      }

      .hero p {
        margin: 0;
        color: #536074;
        font-size: 16px;
      }

      .hero h1 {
        margin: 0;
        font-size: 34px;
        letter-spacing: -0.03em;
      }

      .pair {
        display: grid;
        gap: 20px;
        padding: 24px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(94, 113, 140, 0.14);
        box-shadow: 0 18px 44px rgba(19, 29, 44, 0.12);
      }

      .pair-header {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 16px;
      }

      .pair-header h2,
      .pair-header p {
        margin: 0;
      }

      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 12px;
        color: #6d7b91;
      }

      .delta {
        border-radius: 999px;
        padding: 8px 12px;
        background: rgba(232, 241, 249, 0.85);
        font-size: 12px;
        color: #42536a;
      }

      .columns {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }

      figure {
        margin: 0;
        display: grid;
        gap: 12px;
      }

      figcaption {
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: #6d7b91;
      }

      img {
        width: 100%;
        display: block;
        border-radius: 20px;
        border: 1px solid rgba(91, 110, 136, 0.18);
        box-shadow: 0 10px 30px rgba(16, 27, 43, 0.14);
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="hero">
        <p>Autonomous Realtor Copilot</p>
        <h1>Systemic redesign evidence montage</h1>
        <p>Six key screens compared side by side from the captured baseline and the redesigned build.</p>
      </section>
      ${cards}
    </main>
  </body>
</html>`;

  await fs.writeFile(MONTAGE_HTML, html, "utf8");
}

async function signIn(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Tenant slug").fill("demo-realty");
  await page.getByPlaceholder("Email").fill("agent@demo.local");
  await page.getByPlaceholder("Password").fill("demo123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function screenshotPage(page, fileName) {
  await page.screenshot({
    path: path.join(RESPONSIVE_DIR, fileName),
    fullPage: true
  });
}

async function captureResponsive(browser) {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 900 }
  });

  try {
    await signIn(page);

    await screenshotPage(page, "dashboard-1100.png");

    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto(`${BASE_URL}/contacts`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid='contacts-table-card']");
    await screenshotPage(page, "contacts-820.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/contacts`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid='contacts-table-card']");
    await screenshotPage(page, "contacts-390.png");

    await page.goto(`${BASE_URL}/sequences`, { waitUntil: "networkidle" });
    await page.waitForSelector(
      "[data-testid^='sequence-card-'], [data-testid='empty-sequences']"
    );
    await screenshotPage(page, "sequences-390.png");
  } finally {
    await page.close();
  }
}

async function captureMontage(browser) {
  await buildMontageHtml();

  const page = await browser.newPage({
    viewport: { width: 2200, height: 1400 },
    deviceScaleFactor: 1
  });

  try {
    await page.goto(fileUrl(MONTAGE_HTML), { waitUntil: "load" });
    await page.waitForLoadState("networkidle");
    await wait(1000);
    await page.screenshot({
      path: MONTAGE_PNG,
      fullPage: true
    });
  } finally {
    await page.close();
  }
}

async function main() {
  await ensureDir(RESPONSIVE_DIR);

  const server = START_SERVER ? startServer() : null;
  if (server) {
    await waitForServer(`${BASE_URL}/api/auth/csrf`);
  }

  const browser = await chromium.launch({ headless: true });

  try {
    await captureMontage(browser);
    await captureResponsive(browser);
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

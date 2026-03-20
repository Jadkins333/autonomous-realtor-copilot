/**
 * Playwright global setup — pre-warms Next.js dev-server route compilation.
 *
 * When next dev starts with an empty .next/ cache, every route is compiled
 * on the first request.  Without this warm-up, the first test that hits
 * /api/auth/* or /api/proxy/* can time-out waiting for on-demand compilation.
 *
 * Strategy:
 *  1. GET /api/auth/csrf     → compile NextAuth catch-all (covers signin/callback)
 *  2. POST /api/proxy/auth/login (fake creds) → compile proxy catch-all
 *     Retry every 3 s until the route responds with any non-5xx status
 *     (401 "Invalid credentials" is expected and confirms the route is live)
 *
 * In CI the webServer uses `next start` (a pre-built production bundle), so
 * compilation is already done and this becomes a fast no-op health-check.
 */

import { request } from "@playwright/test";

const BASE = "http://localhost:3003";
const MAX_RETRIES = 30; // 30 × 3 s = 90 s ceiling
const RETRY_DELAY = 3_000;
const REQ_TIMEOUT = 5_000;

type RequestContext = Awaited<ReturnType<(typeof import("@playwright/test"))["request"]["newContext"]>>;

async function retryGet(ctx: RequestContext, url: string): Promise<void> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const resp = await ctx.get(url, { timeout: REQ_TIMEOUT });
      if (resp.status() < 500) return;
    } catch {
      // network error or timeout — server still compiling
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAY));
  }
  console.warn(`[globalSetup] GET ${url} did not respond within warm-up window`);
}

async function retryPost(ctx: RequestContext, url: string, data: unknown): Promise<void> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const resp = await ctx.post(url, { data, timeout: REQ_TIMEOUT });
      if (resp.status() < 500) {
        console.log(`[globalSetup] POST ${url} warmed up (${resp.status()})`);
        return;
      }
    } catch {
      // network error or timeout — route still compiling
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAY));
  }
  console.warn(`[globalSetup] POST ${url} did not respond within warm-up window`);
}

export default async function globalSetup() {
  const ctx = await request.newContext();
  try {
    // 1. Compile NextAuth routes (signin, callback/credentials, csrf, …)
    await retryGet(ctx, `${BASE}/api/auth/csrf`);

    // 2. Compile the proxy catch-all route.
    //    A POST with a nonexistent tenant returns 401 from the API —
    //    that's <500 so the loop exits as soon as the route is ready.
    await retryPost(ctx, `${BASE}/api/proxy/auth/login`, {
      tenant_slug: "__warmup__",
      email: "warmup@warmup.invalid",
      password: "warmup",
    });
  } finally {
    await ctx.dispose();
  }
}

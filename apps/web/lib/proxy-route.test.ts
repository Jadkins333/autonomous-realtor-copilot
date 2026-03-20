import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildProxyTarget, proxyRequest } from "@/lib/proxy-route";

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${path}`, init);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("proxy route", () => {
  it("builds encoded upstream targets", () => {
    expect(buildProxyTarget(["outreach", "draft pack"], "?limit=20")).toContain("draft%20pack");
  });

  it("passes through unauthorized responses and isolates caches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("missing bearer", {
          status: 401,
          headers: { "x-upstream": "api", "x-offline-cache-allowed": "false" }
        })
      )
    );

    const response = await proxyRequest(request("/api/proxy/outreach/drafts"), ["outreach", "drafts"]);

    expect(response.status).toBe(401);
    expect(response.headers.get("x-upstream")).toBe("api");
    expect(response.headers.get("x-offline-cache-allowed")).toBe("false");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toContain("Authorization");
  });

  it("preserves expired-auth upstream responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("expired", { status: 403 }))
    );

    const response = await proxyRequest(
      request("/api/proxy/outreach/drafts", { headers: { Authorization: "Bearer expired" } }),
      ["outreach", "drafts"]
    );

    expect(response.status).toBe(403);
  });

  it("drops malformed hop-by-hop headers before forwarding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await proxyRequest(
      request("/api/proxy/parcels/search?query=high", {
        headers: {
          Authorization: "Bearer token",
          connection: "keep-alive",
          "content-length": "999",
          host: "localhost:3000"
        }
      }),
      ["parcels", "search"]
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer token");
    expect(headers.get("connection")).toBeNull();
    expect(headers.get("content-length")).toBeNull();
    expect(headers.get("host")).toBeNull();
  });

  it("retries idempotent upstream 503 responses once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyRequest(request("/api/proxy/sources/status"), ["sources", "status"]);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-idempotent requests on upstream failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("busy", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyRequest(
      request("/api/proxy/outreach/drafts/id/approve", { method: "POST", body: JSON.stringify({ ok: true }) }),
      ["outreach", "drafts", "id", "approve"]
    );

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps upstream timeouts to gateway timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new Error("timed out"), { name: "AbortError" }))
    );

    const response = await proxyRequest(request("/api/proxy/opportunities"), ["opportunities"]);
    const payload = await response.json();

    expect(response.status).toBe(504);
    expect(payload.detail).toContain("timed out");
  });

  it("marks stale error responses as non-cacheable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("upstream error", { status: 500, headers: { Age: "60" } }))
    );

    const response = await proxyRequest(request("/api/proxy/sources/status"), ["sources", "status"]);

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("age")).toBe("60");
  });
});

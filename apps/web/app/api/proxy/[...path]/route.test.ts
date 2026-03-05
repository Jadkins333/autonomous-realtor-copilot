import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

describe("api proxy route", function () {
 beforeEach(function () {
 vi.resetModules();
 vi.restoreAllMocks();
 process.env.API_INTERNAL_URL = "http://api.internal";
 });

 it("forwards GET query and strips hop headers", async function () {
 const fetchMock = vi.fn().mockResolvedValue(
 new Response(JSON.stringify({ ok: true }), {
 status: 200,
 headers: {
 "content-type": "application/json",
 "transfer-encoding": "chunked"
 }
 })
 );
 vi.stubGlobal("fetch", fetchMock as any);

 const mod = await import("./route");
 const req = new NextRequest("http://localhost/api/proxy/sources/status?x=1", {
 method: "GET",
 headers: {
 authorization: "Bearer t",
 host: "localhost",
 connection: "keep-alive",
 "content-length": "10"
 }
 });

 const res = await mod.GET(req, { params: { path: ["sources", "status"] } });

 expect(fetchMock).toHaveBeenCalledTimes(1);
 const call = fetchMock.mock.calls[0];
 expect(call[0]).toBe("http://api.internal/sources/status?x=1");

 const init = call[1] as RequestInit;
 const sent = init.headers as Headers;
 expect(sent.get("authorization")).toBe("Bearer t");
 expect(sent.get("host")).toBeNull();
 expect(sent.get("connection")).toBeNull();
 expect(sent.get("content-length")).toBeNull();
 expect(res.status).toBe(200);
 });

 it("forwards POST body", async function () {
 const fetchMock = vi.fn().mockResolvedValue(
 new Response(JSON.stringify({ ok: true }), {
 status: 201,
 headers: { "content-type": "application/json" }
 })
 );
 vi.stubGlobal("fetch", fetchMock as any);

 const mod = await import("./route");
 const req = new NextRequest("http://localhost/api/proxy/outreach/drafts", {
 method: "POST",
 body: JSON.stringify({ hello: "world" }),
 headers: { "content-type": "application/json" }
 });

 const res = await mod.POST(req, { params: { path: ["outreach", "drafts"] } });

 expect(fetchMock).toHaveBeenCalledTimes(1);
 const call = fetchMock.mock.calls[0];
 expect(call[0]).toBe("http://api.internal/outreach/drafts");

 const init = call[1] as RequestInit;
 expect(init.method).toBe("POST");
 expect(init.body).toBeTruthy();
 expect(res.status).toBe(201);
 });

 it("strips content-encoding and transfer-encoding response headers", async function () {
 const fetchMock = vi.fn().mockResolvedValue(
 new Response("ok", {
 status: 200,
 headers: {
 "content-type": "text/plain",
 "content-encoding": "gzip",
 "transfer-encoding": "chunked",
 "x-proxy-test": "yes"
 }
 })
 );
 vi.stubGlobal("fetch", fetchMock as any);

 const mod = await import("./route");
 const req = new NextRequest("http://localhost/api/proxy/healthz", { method: "GET" });

 const res = await mod.GET(req, { params: { path: ["healthz"] } });

 expect(res.headers.get("content-encoding")).toBeNull();
 expect(res.headers.get("transfer-encoding")).toBeNull();
 expect(res.headers.get("x-proxy-test")).toBe("yes");
 });

 it("encodes path segments before forwarding", async function () {
 const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
 vi.stubGlobal("fetch", fetchMock as any);

 const mod = await import("./route");
 const req = new NextRequest("http://localhost/api/proxy/raw?q=a%2Fb", { method: "GET" });

 await mod.GET(req, { params: { path: ["spaces and/slash", "100%"] } });

 expect(fetchMock).toHaveBeenCalledTimes(1);
 expect(fetchMock.mock.calls[0][0]).toBe("http://api.internal/spaces%20and%2Fslash/100%25?q=a%2Fb");
 });

 it("handles undefined path arrays by proxying to API root", async function () {
 const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
 vi.stubGlobal("fetch", fetchMock as any);

 const mod = await import("./route");
 const req = new NextRequest("http://localhost/api/proxy?x=1", { method: "GET" });

 await mod.GET(req, { params: { path: undefined as unknown as string[] } });

 expect(fetchMock).toHaveBeenCalledTimes(1);
 expect(fetchMock.mock.calls[0][0]).toBe("http://api.internal/?x=1");
 });

 it("forwards HEAD requests without a request body", async function () {
 const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
 vi.stubGlobal("fetch", fetchMock as any);

 const mod = await import("./route");
 const req = new NextRequest("http://localhost/api/proxy/sources/status", {
 method: "HEAD",
 headers: {
 authorization: "Bearer t",
 "content-length": "99"
 }
 });

 const res = await mod.HEAD(req, { params: { path: ["sources", "status"] } });

 expect(fetchMock).toHaveBeenCalledTimes(1);
 const call = fetchMock.mock.calls[0];
 expect(call[0]).toBe("http://api.internal/sources/status");
 const init = call[1] as RequestInit;
 expect(init.method).toBe("HEAD");
 expect(init.body).toBeUndefined();
 const sent = init.headers as Headers;
 expect(sent.get("content-length")).toBeNull();
 expect(res.status).toBe(204);
 });

 it("forwards OPTIONS requests with body when present", async function () {
 const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
 vi.stubGlobal("fetch", fetchMock as any);

 const mod = await import("./route");
 const req = new NextRequest("http://localhost/api/proxy/outreach/drafts", {
 method: "OPTIONS",
 body: "{}",
 headers: {
 "content-type": "application/json"
 }
 });

 const res = await mod.OPTIONS(req, { params: { path: ["outreach", "drafts"] } });

 expect(fetchMock).toHaveBeenCalledTimes(1);
 const call = fetchMock.mock.calls[0];
 expect(call[0]).toBe("http://api.internal/outreach/drafts");
 const init = call[1] as RequestInit;
 expect(init.method).toBe("OPTIONS");
 expect(init.body).toBeTruthy();
 expect(res.status).toBe(200);
 });
});




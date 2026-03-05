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
});

import React from "react";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Session } from "next-auth";

import { FixtureModeBanner } from "@/components/fixture-mode-banner";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

vi.mock("next-auth/react", function () {
 return {
 useSession: vi.fn(),
 };
});

vi.mock("@/lib/api", function () {
 return {
 apiFetch: vi.fn(),
 };
});

function sessionWithToken(token: string): Session {
 return {
 expires: "2099-01-01T00:00:00.000Z",
 user: {
 id: "user-1",
 email: "agent@example.com",
 name: "Agent",
 role: "agent",
 tenantId: "tenant-1",
 apiToken: token,
 },
 } as Session;
}

describe("FixtureModeBanner", function () {
 beforeEach(function () {
 vi.clearAllMocks();
 window.sessionStorage.clear();
 });

 it("shows a dev-visible warning when cache parsing fails", async function () {
 window.sessionStorage.setItem("fixture-mode-status-cache", "{invalid json");
 vi.mocked(useSession).mockReturnValue({ data: null } as any);

 const warnSpy = vi.spyOn(console, "warn").mockImplementation(function () {
 return;
 });

 render(<FixtureModeBanner />);

 expect(await screen.findByText("Fixture status cache parse failed.")).toBeTruthy();
 expect(warnSpy).toHaveBeenCalledWith("fixture mode cache parse failed", expect.any(SyntaxError));
 expect(apiFetch).not.toHaveBeenCalled();
 });

 it("shows a dev-visible warning when status refresh fails", async function () {
 vi.mocked(useSession).mockReturnValue({ data: sessionWithToken("token-1") } as any);
 vi.mocked(apiFetch).mockRejectedValue(new Error("network down"));

 const warnSpy = vi.spyOn(console, "warn").mockImplementation(function () {
 return;
 });

 render(<FixtureModeBanner />);

 expect(await screen.findByText("Fixture status refresh failed.")).toBeTruthy();
 await waitFor(function () {
 expect(apiFetch).toHaveBeenCalled();
 });
 expect(warnSpy).toHaveBeenCalledWith("fixture mode status fetch failed", expect.any(Error));
 });

 it("shows fixture banner when a critical source is in fixture mode", async function () {
 vi.mocked(useSession).mockReturnValue({ data: sessionWithToken("token-1") } as any);
 vi.mocked(apiFetch).mockResolvedValue({
 items: [{ source_name: "franklin_auditor", mode: "fixture" }],
 } as any);

 render(<FixtureModeBanner />);

 expect(await screen.findByText("Fixture mode: demo data in use. Live sources not connected.")).toBeTruthy();
 });
});



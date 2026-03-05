"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

export default function OutreachPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [rows, setRows] = useState<any[]>([]);
  const [actionResult, setActionResult] = useState<string | null>(null);

  async function loadDrafts() {
    if (!session) return;
    const data = await apiFetch<any[]>("/outreach/drafts", (session as any).apiToken);
    setRows(data);
  }

  async function approve(id: string) {
    if (!session) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setActionResult(
        JSON.stringify({ status: "blocked_offline", reason: "Offline mode disables write actions." })
      );
      return;
    }
    const result = await apiFetch<any>(`/outreach/${id}/approve_and_send`, (session as any).apiToken, {
      method: "POST"
    });
    setActionResult(JSON.stringify(result));
    await loadDrafts();
  }

  useEffect(() => {
    void loadDrafts();
  }, [session]);

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <Card className="mb-4">
        <CardTitle>Outreach Autopilot</CardTitle>
        <CardDescription>
          Sandbox is ON by default. Approvals queue messages without real delivery unless sandbox is disabled.
        </CardDescription>
        {actionResult ? (
          <pre className="mt-3 overflow-auto rounded-xl bg-muted p-3 text-xs">{actionResult}</pre>
        ) : null}
      </Card>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Channel</Th>
              <Th>Subject</Th>
              <Th>Body</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>{row.channel}</Td>
                <Td>{row.subject ?? "-"}</Td>
                <Td>{row.body}</Td>
                <Td>{row.status}</Td>
                <Td>
                  <Button onClick={() => approve(row.id)}>Approve</Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </SiteShell>
  );
}

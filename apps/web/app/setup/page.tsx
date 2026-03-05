"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type SourceStatusItem = {
  source_name: string;
  mode: string;
  state: string;
  drift_detected: boolean;
  dlq_count: number;
  last_error: string | null;
  last_run_finished_at: string | null;
};

type SourceStatusResponse = {
  items: SourceStatusItem[];
};

const COMMANDS = ["pnpm run project:setup", "pnpm smoke"];

export default function SetupPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();

  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [sources, setSources] = useState<SourceStatusItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let mounted = true;

    const load = async () => {
      try {
        setError(null);
        const [diag, sourcePayload] = await Promise.all([
          apiFetch<Record<string, unknown>>("/system/diagnostics", (session as any).apiToken),
          apiFetch<SourceStatusResponse>("/sources/status", (session as any).apiToken),
        ]);
        if (!mounted) return;
        setDiagnostics(diag);
        setSources(sourcePayload.items || []);
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "Failed to load setup diagnostics";
        setError(message);
      }
    };

    void load();
  }, [session]);

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // no-op
    }
  };

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <Card className="mb-4">
        <CardTitle>Setup & Health</CardTitle>
        <CardDescription className="mt-1">
          These buttons copy commands only. They do not run commands from the browser.
        </CardDescription>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {COMMANDS.map((command) => (
            <div key={command} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2">
              <code className="text-xs">{command}</code>
              <Button variant="outline" onClick={() => copyCommand(command)}>
                Copy
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {error ? (
        <Card className="mb-4">
          <CardTitle>Status Error</CardTitle>
          <CardDescription className="mt-1 text-red-500">{error}</CardDescription>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardTitle className="mb-3">System Diagnostics</CardTitle>
        <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">
          {JSON.stringify(diagnostics, null, 2)}
        </pre>
      </Card>

      <Card>
        <CardTitle className="mb-3">Sources Status</CardTitle>
        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.source_name} className="rounded-xl border bg-card p-3 text-sm">
              <p className="font-semibold">{source.source_name}</p>
              <p className="text-muted-foreground">
                mode={source.mode} state={source.state} drift={String(source.drift_detected)} dlq={source.dlq_count}
              </p>
              {source.last_error ? <p className="text-xs text-red-400">last_error: {source.last_error}</p> : null}
            </div>
          ))}
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No source status rows found.</p>
          ) : null}
        </div>
      </Card>
    </SiteShell>
  );
}

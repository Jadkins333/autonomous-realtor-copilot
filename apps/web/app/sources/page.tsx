"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type SourceStatusItem = {
  source_name: string;
  mode: "live" | "fixture";
  state: "ok" | "partial" | "failed" | "paused";
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  drift_detected: boolean;
  drift_reason: string | null;
  dlq_count: number;
  paused_reason: string | null;
  updated_at: string;
};

type SourceStatusResponse = { items: SourceStatusItem[] };

type ReplayResponse = {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped_duplicate: number;
  message: string;
};

function StateBadge({ state }: { state: SourceStatusItem["state"] }) {
  const className =
    state === "ok"
      ? "bg-green-500/20 text-green-200"
      : state === "partial"
        ? "bg-amber-500/20 text-amber-200"
        : state === "paused"
          ? "bg-blue-500/20 text-blue-200"
          : "bg-red-500/20 text-red-200";
  return <Badge className={className}>{state}</Badge>;
}

export default function SourcesPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();

  const [items, setItems] = useState<SourceStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const isAdmin = useMemo(() => (session?.user as any)?.role === "admin", [session]);

  const load = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const response = await apiFetch<SourceStatusResponse>("/sources/status", (session as any).apiToken);
      setItems(response.items || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sources");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session]);

  const runAction = async (sourceName: string, action: "pause" | "resume" | "replay") => {
    if (!session || !isAdmin) return;
    setActionMessage(null);

    try {
      if (action === "pause") {
        const reason = window.prompt("Pause reason", "Manual pause from web admin") || "Manual pause from web admin";
        await apiFetch(`/sources/${sourceName}/pause`, (session as any).apiToken, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        setActionMessage(`${sourceName} paused`);
      } else if (action === "resume") {
        await apiFetch(`/sources/${sourceName}/resume`, (session as any).apiToken, {
          method: "POST",
        });
        setActionMessage(`${sourceName} resumed`);
      } else {
        const replay = await apiFetch<ReplayResponse>(`/sources/${sourceName}/dlq/replay`, (session as any).apiToken, {
          method: "POST",
        });
        setActionMessage(
          `${sourceName} replay: attempted=${replay.attempted} succeeded=${replay.succeeded} failed=${replay.failed}`
        );
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : `Failed ${action} for ${sourceName}`);
    } finally {
      await load();
    }
  };

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <Card className="mb-4">
        <CardTitle>Sources Admin</CardTitle>
        <CardDescription>
          Live ingestion source status with pause/resume/replay controls. Auth required; actions are admin-only.
        </CardDescription>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
          {!isAdmin ? <Badge>read-only (agent role)</Badge> : <Badge>admin controls enabled</Badge>}
        </div>
        {actionMessage ? <p className="mt-3 text-sm text-muted-foreground">{actionMessage}</p> : null}
      </Card>

      {loading ? <Card>Loading sources...</Card> : null}
      {error ? (
        <Card>
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.source_name}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.source_name}</p>
                  <p className="text-xs text-muted-foreground">mode={item.mode}</p>
                </div>
                <StateBadge state={item.state} />
              </div>

              <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                <p>last_run_finished_at: {item.last_run_finished_at || "-"}</p>
                <p>last_success_at: {item.last_success_at || "-"}</p>
                <p>drift_detected: {String(item.drift_detected)}</p>
                <p>dlq_count: {item.dlq_count}</p>
                {item.paused_reason ? <p>paused_reason: {item.paused_reason}</p> : null}
                {item.last_error ? <p className="text-red-300">last_error: {item.last_error}</p> : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={!isAdmin} variant="outline" onClick={() => void runAction(item.source_name, "pause")}>
                  Pause
                </Button>
                <Button disabled={!isAdmin} variant="outline" onClick={() => void runAction(item.source_name, "resume")}>
                  Resume
                </Button>
                <Button disabled={!isAdmin} variant="outline" onClick={() => void runAction(item.source_name, "replay")}>
                  Replay DLQ
                </Button>
              </div>
            </Card>
          ))}
          {items.length === 0 ? <Card>No sources found.</Card> : null}
        </div>
      ) : null}
    </SiteShell>
  );
}

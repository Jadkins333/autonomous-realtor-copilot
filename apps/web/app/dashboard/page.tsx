"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type SourceItem = {
  source_name: string;
  state: string;
  drift_detected: boolean;
  is_stale: boolean;
};

export default function DashboardPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [sources, setSources] = useState<SourceItem[] | null>(null);
  const [tourDismissed, setTourDismissed] = useState(false);

  useEffect(() => {
    if (!session) return;
    apiFetch<Record<string, unknown>>("/metrics", session?.apiToken)
      .then(setMetrics)
      .catch(() => setMetrics(null));
    apiFetch<{ items: SourceItem[] }>("/sources/status", session?.apiToken)
      .then((r) => setSources(r.items ?? []))
      .catch(() => setSources(null));
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem("tour_mode_dismissed");
    setTourDismissed(dismissed === "true");
  }, []);

  const dismissTour = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("tour_mode_dismissed", "true");
    }
    setTourDismissed(true);
  };

  if (status !== "authenticated") {
    return null;
  }

  const driftSources = sources?.filter((s) => s.drift_detected) ?? [];
  const staleSources = sources?.filter((s) => s.is_stale) ?? [];
  const okCount = sources?.filter((s) => s.state === "ok").length ?? 0;
  const partialCount = sources?.filter((s) => s.state === "partial").length ?? 0;
  const failedCount = sources?.filter((s) => s.state === "failed").length ?? 0;

  return (
    <SiteShell>
      {!tourDismissed ? (
        <Card className="mb-4">
          <CardTitle>Tour Mode</CardTitle>
          <CardDescription>
            1. Search a property. 2. Open insight + provenance. 3. Draft outreach in sandbox. 4. Run a copilot command.
          </CardDescription>
          <div className="mt-3">
            <Button onClick={dismissTour} variant="outline">
              Dismiss tour
            </Button>
          </div>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardTitle>Demo Mode</CardTitle>
          <CardDescription>
            Outreach sandbox is enabled by default. Approvals stage outbound messages safely.
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Public Data Connectors</CardTitle>
          <CardDescription>
            Franklin Auditor, ArcGIS, FEMA, Overpass, and GTFS run with graceful seed fallback.
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Truth Layer</CardTitle>
          <CardDescription>
            Metrics include formula markdown, inputs, provenance, and freshness metadata.
          </CardDescription>
        </Card>
      </div>

      {/* Sources Health card */}
      <Card className="mt-4" data-testid="sources-health-card">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>Source Health</CardTitle>
          <Link href="/sources" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            Manage →
          </Link>
        </div>
        <CardDescription className="mb-3">
          Ingestion pipeline status across all configured connectors.
        </CardDescription>

        {sources === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <>
            {driftSources.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                ⚠ {driftSources.length} source{driftSources.length > 1 ? "s" : ""} drifted:{" "}
                {driftSources.map((s) => s.source_name).join(", ")}
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              {okCount > 0 && (
                <Badge className="bg-green-500/20 text-green-200">{okCount} ok</Badge>
              )}
              {partialCount > 0 && (
                <Badge className="bg-amber-500/20 text-amber-200">{partialCount} partial</Badge>
              )}
              {failedCount > 0 && (
                <Badge className="bg-red-500/20 text-red-200">{failedCount} failed</Badge>
              )}
              {staleSources.length > 0 && (
                <Badge className="bg-orange-500/20 text-orange-300">{staleSources.length} stale</Badge>
              )}
              {sources.length === 0 && <span className="text-muted-foreground">No sources configured.</span>}
            </div>
          </>
        )}
      </Card>

      <Card className="mt-4">
        <CardTitle className="mb-3">System Metrics</CardTitle>
        <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">
          {JSON.stringify(metrics, null, 2)}
        </pre>
      </Card>
    </SiteShell>
  );
}

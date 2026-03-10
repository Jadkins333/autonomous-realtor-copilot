"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Compass, Database, ShieldCheck } from "lucide-react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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
    apiFetch<Record<string, unknown>>("/metrics", session.apiToken)
      .then(setMetrics)
      .catch(() => setMetrics(null));
    apiFetch<{ items: SourceItem[] }>("/sources/status", session.apiToken)
      .then((response) => setSources(response.items ?? []))
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

  const driftSources = sources?.filter((item) => item.drift_detected) ?? [];
  const staleSources = sources?.filter((item) => item.is_stale) ?? [];
  const okCount = sources?.filter((item) => item.state === "ok").length ?? 0;
  const partialCount =
    sources?.filter((item) => item.state === "partial").length ?? 0;
  const failedCount =
    sources?.filter((item) => item.state === "failed").length ?? 0;

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Operations overview"
        title="Dashboard"
        description="A calmer high-signal view of what is healthy, what needs attention, and where the workflow wants to go next."
        meta={
          <>
            <Badge
              className="bg-success/10 text-success"
              data-testid="ok-badge"
            >
              {okCount} ok
            </Badge>
            {partialCount > 0 ? (
              <Badge
                className="bg-warning/10 text-warning-foreground"
                data-testid="partial-badge"
              >
                {partialCount} partial
              </Badge>
            ) : null}
            {failedCount > 0 ? (
              <Badge
                className="bg-destructive/10 text-destructive"
                data-testid="failed-badge"
              >
                {failedCount} failed
              </Badge>
            ) : null}
            {staleSources.length > 0 ? (
              <Badge
                className="bg-accent/10 text-accent-foreground"
                data-testid="stale-badge"
              >
                {staleSources.length} stale
              </Badge>
            ) : null}
          </>
        }
        actions={
          <Link
            href="/sources"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-backgroundAlt"
          >
            Review sources
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {!tourDismissed ? (
        <Card className="mb-5 overflow-hidden" data-testid="tour-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="section-label">Guided momentum</p>
              <div className="space-y-2">
                <CardTitle>Tour Mode</CardTitle>
                <CardDescription>
                  Move through the core product loop without guessing what
                  matters first.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {[
                  "Search a property",
                  "Open insight and provenance",
                  "Draft outreach in sandbox",
                  "Run a copilot command"
                ].map((step) => (
                  <span
                    key={step}
                    className="rounded-full border border-border/70 bg-card-muted/70 px-3 py-1.5"
                  >
                    {step}
                  </span>
                ))}
              </div>
            </div>
            <Button
              onClick={dismissTour}
              variant="outline"
              data-testid="dismiss-tour-btn"
            >
              Dismiss tour
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card data-testid="demo-mode-card">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Compass className="h-5 w-5" />
          </div>
          <CardTitle>Demo Mode</CardTitle>
          <CardDescription className="mt-2">
            Outreach sandbox is enabled by default so teams can validate
            decisions without risking real delivery.
          </CardDescription>
        </Card>
        <Card data-testid="connectors-card">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-info/10 text-info">
            <Database className="h-5 w-5" />
          </div>
          <CardTitle>Public Data Connectors</CardTitle>
          <CardDescription className="mt-2">
            Franklin Auditor, ArcGIS, FEMA, Overpass, and GTFS keep running with
            graceful fallback behavior.
          </CardDescription>
        </Card>
        <Card data-testid="truth-layer-card">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-success/10 text-success">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <CardTitle>Truth Layer</CardTitle>
          <CardDescription className="mt-2">
            Every metric stays grounded in formula markdown, inputs, provenance,
            and freshness metadata.
          </CardDescription>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)]">
        <Card data-testid="sources-health-card">
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Live posture</p>
              <CardTitle>Source Health</CardTitle>
              <CardDescription>
                Connector status across the ingestion pipeline, tuned for quick
                scanning.
              </CardDescription>
            </div>
            <Link
              href="/sources"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
            >
              Manage
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {sources === null ? (
            <div className="mt-5 space-y-3" data-testid="sources-loading">
              <div className="skeleton-block h-12" />
              <div className="skeleton-block h-12" />
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {driftSources.length > 0 ? (
                <div
                  className="rounded-[22px] border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning-foreground"
                  data-testid="drift-alert"
                >
                  {driftSources.length} source
                  {driftSources.length > 1 ? "s" : ""} drifted:{" "}
                  {driftSources.map((item) => item.source_name).join(", ")}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="detail-item">
                  <p className="detail-item-label">Healthy connectors</p>
                  <p className="detail-item-value">{okCount}</p>
                </div>
                <div className="detail-item">
                  <p className="detail-item-label">Needs review</p>
                  <p className="detail-item-value">
                    {partialCount + failedCount + staleSources.length}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                {okCount > 0 ? (
                  <Badge className="bg-success/10 text-success">
                    {okCount} ok
                  </Badge>
                ) : null}
                {partialCount > 0 ? (
                  <Badge className="bg-warning/10 text-warning-foreground">
                    {partialCount} partial
                  </Badge>
                ) : null}
                {failedCount > 0 ? (
                  <Badge className="bg-destructive/10 text-destructive">
                    {failedCount} failed
                  </Badge>
                ) : null}
                {staleSources.length > 0 ? (
                  <Badge className="bg-accent/10 text-accent-foreground">
                    {staleSources.length} stale
                  </Badge>
                ) : null}
                {sources.length === 0 ? (
                  <span
                    className="text-muted-foreground"
                    data-testid="no-sources"
                  >
                    No sources configured.
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </Card>

        <Card data-testid="metrics-card">
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Telemetry</p>
              <CardTitle>System Metrics</CardTitle>
              <CardDescription>
                Direct payload from the metrics endpoint for trust and
                troubleshooting.
              </CardDescription>
            </div>
            <Badge variant="outline">read-only</Badge>
          </div>
          <pre className="mt-5 overflow-auto rounded-[22px] border border-border/70 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
            {JSON.stringify(metrics, null, 2)}
          </pre>
        </Card>
      </div>
    </SiteShell>
  );
}

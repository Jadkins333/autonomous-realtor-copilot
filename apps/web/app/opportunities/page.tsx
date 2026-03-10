"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, SlidersHorizontal } from "lucide-react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api";

type OpportunityItem = {
  parcel_id: string;
  address: string;
  parcel_number: string;
  city: string;
  state: string;
  zip: string;
  opportunity_flags: string[];
  status: "ok" | "insufficient_data";
  missing_inputs: string[];
  event_signal?: {
    count_30d?: number;
    latest?: {
      event_type?: string;
      severity?: string;
      created_at?: string;
    } | null;
  };
  neighborhood_heat: {
    value?: { score_0_100?: number };
  };
  distress_likelihood: {
    value?: { score_0_1?: number };
  };
};

type OpportunitiesResponse = {
  status: "ok" | "insufficient_data";
  model_version: string;
  items: OpportunityItem[];
};

export default function OpportunitiesPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [payload, setPayload] = useState<OpportunitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [minHeat, setMinHeat] = useState(0);

  useEffect(() => {
    if (status !== "authenticated" || !session) return;

    let mounted = true;
    (async () => {
      try {
        const data = await apiFetch<OpportunitiesResponse>("/opportunities", session?.apiToken);
        if (mounted) {
          setPayload(data);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [session, status]);

  const rows = useMemo(() => {
    const all = payload?.items || [];
    return all.filter((item) => Number(item.neighborhood_heat?.value?.score_0_100 || 0) >= minHeat);
  }, [payload, minHeat]);

  const allItems = payload?.items || [];
  const surfacedCount = rows.length;
  const insufficientCount = rows.filter((item) => item.status === "insufficient_data").length;
  const strongestHeat = rows.reduce((max, item) => {
    const heat = Number(item.neighborhood_heat?.value?.score_0_100 || 0);
    return Math.max(max, Math.round(heat));
  }, 0);

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Deterministic pipeline"
        title="Opportunities"
        description="Public-data opportunity feed grounded in parcel heuristics, source provenance, and deterministic scoring. AI does not score these parcels or replace the underlying signals."
        meta={
          <>
            <Badge variant="outline">
              {payload?.model_version ? `Model ${payload.model_version}` : "Model pending"}
            </Badge>
            <Badge variant={insufficientCount > 0 ? "warning" : "success"}>
              {insufficientCount > 0
                ? `${insufficientCount} partial signal${insufficientCount === 1 ? "" : "s"}`
                : "Full signal rows"}
            </Badge>
            <span>{allItems.length} total rows loaded</span>
          </>
        }
        actions={
          <Link
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-backgroundAlt"
            href="/opportunities/events"
          >
            View event log
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr),minmax(0,1.08fr)]">
        <Card>
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Filter the feed</p>
              <CardTitle>Opportunity thresholds</CardTitle>
              <CardDescription>
                Adjust the minimum heat threshold to narrow the operator queue.
                The heat score stays deterministic and is calculated from saved
                parcel inputs only.
              </CardDescription>
            </div>
            <div className="soft-note inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <span>Filter does not change the underlying score.</span>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="app-panel-muted px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label
                  className="min-w-0 flex-1 text-sm font-medium text-foreground"
                  htmlFor="opportunity-heat-filter"
                >
                  Minimum heat score
                </label>
                <output
                  className="rounded-full border border-border/70 px-3 py-1 text-sm font-semibold text-foreground"
                  data-testid="heat-filter-output"
                  htmlFor="opportunity-heat-filter"
                >
                  {minHeat}
                </output>
              </div>
              <input
                id="opportunity-heat-filter"
                aria-describedby="opportunity-heat-help"
                aria-label="Minimum heat score"
                className="mt-4 w-full accent-primary"
                max={100}
                min={0}
                onChange={(event) => setMinHeat(Number(event.target.value))}
                step={5}
                type="range"
                value={minHeat}
              />
              <p
                className="mt-3 text-sm leading-6 text-muted-foreground"
                id="opportunity-heat-help"
              >
                Raise the threshold to focus on the hottest deterministic
                opportunities first.
              </p>
            </div>

            <Card
              className="border border-border/70 bg-card-muted/60 shadow-none"
              data-testid="opportunities-summary-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="section-label">Filtered snapshot</p>
                  <CardTitle className="mt-2">
                    {surfacedCount} shown
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {loading
                      ? "Refreshing filtered opportunities..."
                      : surfacedCount === 0
                        ? "No rows currently meet the selected threshold."
                        : `Strongest visible heat score is ${strongestHeat}.`}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{allItems.length} loaded</Badge>
                  <Badge variant={insufficientCount > 0 ? "warning" : "success"}>
                    {insufficientCount > 0 ? `${insufficientCount} partial` : "No partials"}
                  </Badge>
                </div>
              </div>
            </Card>
          </div>
        </Card>

        <div className="space-y-3">
          {loading ? (
            <Card className="p-4" data-testid="opportunities-loading">
              Loading opportunities...
            </Card>
          ) : null}

          {!loading && rows.length === 0 ? (
            <div data-testid="no-opportunities">
              <EmptyState
                icon={<Activity className="h-5 w-5" />}
                title="No opportunities match this threshold"
                description="Lower the minimum heat score or wait for new deterministic source inputs to refresh the queue."
              />
            </div>
          ) : null}

          {rows.map((row) => {
            const heat = Number(row.neighborhood_heat?.value?.score_0_100 || 0);
            const distress = Number(row.distress_likelihood?.value?.score_0_1 || 0);
            return (
              <Card
                key={row.parcel_id}
                className="p-4"
                data-testid={`opportunity-card-${row.parcel_id}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{row.address}</p>
                    <p className="text-sm text-muted-foreground">
                      Parcel {row.parcel_number} • {row.city}, {row.state} {row.zip}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge data-testid={`heat-badge-${row.parcel_id}`}>
                      Heat {Math.round(heat)}
                    </Badge>
                    <Badge
                      className={distress >= 0.55 ? "bg-red-500/20 text-red-200" : ""}
                      data-testid={`distress-badge-${row.parcel_id}`}
                    >
                      Distress {(distress * 100).toFixed(0)}%
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(row.opportunity_flags || []).length ? (
                    row.opportunity_flags.map((flag) => (
                      <Badge key={flag}>
                        {flag.replaceAll("_", " ")}
                      </Badge>
                    ))
                  ) : (
                    <Badge>no active flags</Badge>
                  )}
                  <Badge>Events 30d {Number(row.event_signal?.count_30d || 0)}</Badge>
                </div>

                {row.event_signal?.latest ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Latest trigger: {String(row.event_signal.latest.event_type || "unknown").replaceAll("_", " ")} (
                    {row.event_signal.latest.severity || "n/a"}){" "}
                    {row.event_signal.latest.created_at
                      ? new Date(row.event_signal.latest.created_at).toLocaleString()
                      : ""}
                  </p>
                ) : null}

                {row.status === "insufficient_data" ? (
                  <p className="mt-3 text-xs text-amber-300">
                    Partial signal: missing {row.missing_inputs.join(", ") || "source inputs"}. No values were fabricated.
                  </p>
                ) : null}

                <div className="mt-3">
                  <Link
                    className="text-sm text-accent underline underline-offset-4"
                    href={`/properties/${row.parcel_id}`}
                  >
                    Open property profile
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </SiteShell>
  );
}

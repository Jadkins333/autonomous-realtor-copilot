"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
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

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <Card className="mb-4">
        <CardTitle>Opportunities</CardTitle>
        <CardDescription>
          Public-data opportunity feed using deterministic parcel heuristics with provenance-backed inputs.
        </CardDescription>
        <div className="mt-2">
          <Link className="text-sm text-accent underline" href="/opportunities/events">
            View opportunity event log
          </Link>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <label className="mb-2 block text-sm font-medium">Minimum Heat Score: {minHeat}</label>
        <input
          aria-label="Minimum heat score"
          className="w-full"
          max={100}
          min={0}
          onChange={(event) => setMinHeat(Number(event.target.value))}
          step={5}
          type="range"
          value={minHeat}
        />
      </Card>

      <div className="space-y-3">
        {loading ? <Card className="p-4">Loading opportunities...</Card> : null}

        {!loading && rows.length === 0 ? (
          <Card className="p-4">No opportunities available for the selected filter.</Card>
        ) : null}

        {rows.map((row) => {
          const heat = Number(row.neighborhood_heat?.value?.score_0_100 || 0);
          const distress = Number(row.distress_likelihood?.value?.score_0_1 || 0);
          return (
            <Card key={row.parcel_id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{row.address}</p>
                  <p className="text-sm text-muted-foreground">
                    Parcel {row.parcel_number} • {row.city}, {row.state} {row.zip}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary">Heat {Math.round(heat)}</Badge>
                  <Badge variant={distress >= 0.55 ? "destructive" : "outline"}>
                    Distress {(distress * 100).toFixed(0)}%
                  </Badge>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(row.opportunity_flags || []).length ? (
                  row.opportunity_flags.map((flag) => (
                    <Badge key={flag} variant="outline">
                      {flag.replaceAll("_", " ")}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline">no active flags</Badge>
                )}
                <Badge variant="secondary">Events 30d {Number(row.event_signal?.count_30d || 0)}</Badge>
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
                <Link className="text-sm text-accent underline" href={`/properties/${row.parcel_id}`}>
                  Open property profile
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </SiteShell>
  );
}

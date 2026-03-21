"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, BriefcaseBusiness, MapPin, ShieldCheck } from "lucide-react";

import { PropertyMap } from "@/components/property-map";
import { ProvenanceDrawer } from "@/components/provenance-drawer";
import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type NearbyPoi = {
  name: string;
  category: string;
  distance_meters: number;
};

type TimelineEvent = {
  event_type: string;
  occurred_at: string;
  title: string;
};

type Insight = {
  value?: {
    roi_band?: string;
    guidance?: string;
    pressure_level?: string;
    note?: string;
  };
  formula_markdown?: string;
  inputs?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
};

type ParcelDetail = {
  id: string;
  address: string;
  parcel_number: string;
  city: string;
  state: string;
  zip: string;
  attributes_json?: Record<string, unknown> | null;
  permits_summary?: { last_12_months_count?: number };
  flood_zone?: { intersects?: boolean; zone_code?: string | null };
  transit_proximity?: { score_0_100?: number };
  nearby_pois?: NearbyPoi[];
  timeline?: TimelineEvent[];
  insights?: {
    renovation_roi?: Insight;
    insurance_pressure?: Insight;
  };
  provenance?: {
    formula_markdown?: string;
    inputs?: Record<string, unknown>;
    freshness?: Record<string, unknown>;
    metric_provenance?: Record<string, unknown>;
  };
};

type NegotiationPayload = {
  status: string;
  motivation_score?: number | null;
  missing_inputs?: string[];
  freshness?: { staleness?: string };
  signals_used?: Array<{ signal: string; raw_value: unknown; rule_hits: string[] }>;
  formula_markdown?: string;
  inputs?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
};

type CapturePayload = {
  deal_id: string;
  task_id: string;
  deal_title: string;
  task_title: string;
};

function fmtDate(value?: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleDateString();
}

export default function PropertyDetailPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ParcelDetail | null>(null);
  const [negotiation, setNegotiation] = useState<NegotiationPayload | null>(null);
  const [captureResult, setCaptureResult] = useState<CapturePayload | null>(null);
  const [capturePending, setCapturePending] = useState(false);

  useEffect(() => {
    if (!session?.apiToken || !params.id) return;
    Promise.all([
      apiFetch<ParcelDetail>(`/parcels/${params.id}`, session.apiToken),
      apiFetch<NegotiationPayload>(`/parcels/${params.id}/negotiation`, session.apiToken).catch(() => null),
    ]).then(([parcel, negotiationPayload]) => {
      setData(parcel);
      setNegotiation(negotiationPayload);
    });
  }, [params.id, session?.apiToken]);

  async function captureProperty() {
    if (!session?.apiToken || !params.id) return;
    setCapturePending(true);
    try {
      const result = await apiFetch<CapturePayload>(
        `/workspace/capture/opportunity/${params.id}`,
        session.apiToken,
        { method: "POST" },
      );
      setCaptureResult(result);
    } finally {
      setCapturePending(false);
    }
  }

  const coordinates = useMemo(() => {
    const raw = data?.attributes_json?.coordinates;
    if (Array.isArray(raw) && raw.length >= 2) {
      const [lon, lat] = raw.map(Number);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        return { lon, lat };
      }
    }
    return { lon: -82.9988, lat: 39.9612 };
  }, [data?.attributes_json]);

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/properties" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to properties
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-orange-500 text-white hover:bg-orange-400"
            disabled={capturePending}
            onClick={captureProperty}
          >
            <BriefcaseBusiness className="mr-2 h-4 w-4" />
            {capturePending ? "Capturing..." : "Capture Seller Lead"}
          </Button>
          {captureResult ? (
            <Link href={`/deals/${captureResult.deal_id}`}>
              <Button variant="outline" className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]">
                Open Deal
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      <Card className="mb-6 border-white/[0.08] bg-[#13161f] text-white" data-testid="property-detail-header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-3xl text-white">{data?.address || "Property detail"}</CardTitle>
            <CardDescription className="mt-2 text-white/45">
              Parcel {data?.parcel_number} · {data?.city}, {data?.state} {data?.zip}
            </CardDescription>
            <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-white/45">
              <span>{String(data?.attributes_json?.property_type || "property").replace(/_/g, " ")}</span>
              <span>{data?.attributes_json?.year_built ? `Built ${String(data.attributes_json.year_built)}` : "Year unknown"}</span>
              <span>{data?.attributes_json?.beds ? `${String(data.attributes_json.beds)} bd` : "Beds unknown"}</span>
              <span>{data?.attributes_json?.baths ? `${String(data.attributes_json.baths)} ba` : "Baths unknown"}</span>
              <span>{data?.attributes_json?.sqft ? `${String(data.attributes_json.sqft)} sqft` : "Sqft unknown"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge label={`Permits 12M: ${data?.permits_summary?.last_12_months_count ?? "-"}`} testId="permits-badge" />
            <Badge label={`Flood: ${String(data?.flood_zone?.intersects ?? false)}`} testId="flood-intersects-badge" />
            <Badge label={`Zone: ${data?.flood_zone?.zone_code ?? "Unknown"}`} testId="flood-zone-badge" />
            <Badge label={`Transit: ${Math.round(Number(data?.transit_proximity?.score_0_100 ?? 0))}`} testId="transit-badge" />
          </div>
        </div>
        {captureResult ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Captured into pipeline as <span className="font-semibold">{captureResult.deal_title}</span>. First task: {captureResult.task_title}.
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/[0.08] bg-[#13161f] text-white" data-testid="map-card">
          <CardTitle className="mb-4 text-white">Map</CardTitle>
          <PropertyMap lat={coordinates.lat} lon={coordinates.lon} />
          <p className="mt-3 flex items-center gap-2 text-sm text-white/45">
            <MapPin className="h-4 w-4" />
            Last sale: {fmtDate(String(data?.attributes_json?.last_sale_date || ""))}
          </p>
        </Card>

        <Card className="border-white/[0.08] bg-[#13161f] text-white">
          <CardTitle className="mb-4 text-white">Negotiation / Seller Motivation</CardTitle>
          <p className="text-5xl font-bold text-orange-300">
            {negotiation?.motivation_score ?? "--"}
          </p>
          <p className="mt-2 text-sm text-white/50">
            {negotiation?.status === "insufficient_data"
              ? `Partial view. Missing: ${(negotiation?.missing_inputs || []).join(", ")}`
              : "Rule-based signal using sale recency, violations, and permit activity."}
          </p>
          <div className="mt-4 space-y-2">
            {(negotiation?.signals_used || []).map((signal) => (
              <div key={signal.signal} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-sm">
                <p className="font-medium text-white">{signal.signal.replace(/_/g, " ")}</p>
                <p className="mt-1 text-white/45">Raw value: {String(signal.raw_value ?? "unknown")}</p>
                {signal.rule_hits.length ? (
                  <p className="mt-1 text-xs text-orange-300">{signal.rule_hits.join(" · ")}</p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/[0.08] bg-[#13161f] text-white" data-testid="pois-card">
          <CardTitle className="mb-4 text-white">Nearby Places</CardTitle>
          {(data?.nearby_pois || []).length ? (
            <ul className="space-y-2 text-sm" data-testid="pois-list">
              {data?.nearby_pois?.map((poi) => (
                <li key={`${poi.name}-${poi.distance_meters}`} data-testid={`poi-item-${poi.name}`}>
                  {poi.category}: {poi.name} ({poi.distance_meters} m)
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/35" data-testid="pois-empty">No nearby place records surfaced for this parcel.</p>
          )}
        </Card>

        <Card className="border-white/[0.08] bg-[#13161f] text-white">
          <CardTitle className="mb-4 text-white">Truth Layer</CardTitle>
          <p className="mb-3 text-sm text-white/45">
            This screen keeps provenance visible, but it now connects directly into deal capture instead of stopping at the analysis.
          </p>
          <ProvenanceDrawer
            formula={negotiation?.formula_markdown || data?.insights?.renovation_roi?.formula_markdown || "No formula available"}
            inputs={negotiation?.inputs || data?.insights?.renovation_roi?.inputs || {}}
            provenance={{
              metric_provenance: negotiation?.provenance || data?.insights?.renovation_roi?.provenance || {},
              trace: { freshness: negotiation?.freshness || {} },
            }}
          />
        </Card>

        <InsightCard
          id="insight-roi-card"
          title="Renovation ROI"
          summary={data?.insights?.renovation_roi?.value?.roi_band || "Unknown"}
          detail={data?.insights?.renovation_roi?.value?.guidance || "No ROI guidance available."}
        />
        <InsightCard
          id="insight-insurance-card"
          title="Insurance Pressure"
          summary={data?.insights?.insurance_pressure?.value?.pressure_level || "Unknown"}
          detail={data?.insights?.insurance_pressure?.value?.note || "No insurance note available."}
        />
      </div>

      <Card className="mt-6 border-white/[0.08] bg-[#13161f] text-white">
        <CardTitle className="mb-4 text-white">Timeline</CardTitle>
        {(data?.timeline || []).length ? (
          <div className="space-y-3">
            {data?.timeline?.map((item) => (
              <div key={`${item.event_type}-${item.occurred_at}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4" data-testid={`timeline-event-${item.event_type}`}>
                <p className="font-medium text-white">{item.title}</p>
                <p className="mt-1 text-sm text-white/45">{fmtDate(item.occurred_at)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/35" data-testid="timeline-empty">No timeline events available for this parcel.</p>
        )}
      </Card>
    </SiteShell>
  );
}

function Badge({ label, testId }: { label: string; testId: string }) {
  return (
    <span
      className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/80"
      data-testid={testId}
    >
      {label}
    </span>
  );
}

function InsightCard({
  id,
  title,
  summary,
  detail,
}: {
  id: string;
  title: string;
  summary: string;
  detail: string;
}) {
  return (
    <Card className="border-white/[0.08] bg-[#13161f] text-white" data-testid={id}>
      <CardTitle className="text-white">{title}</CardTitle>
      <p className="mt-3 text-3xl font-bold text-orange-300">{summary}</p>
      <p className="mt-2 text-sm text-white/50">{detail}</p>
      <p className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/35">
        <ShieldCheck className="h-3.5 w-3.5" />
        Surface this in the client conversation, not just the analysis.
      </p>
    </Card>
  );
}

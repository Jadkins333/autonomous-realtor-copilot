"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Compass, MapPinned, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { PropertyMap } from "@/components/property-map";
import { ProvenanceDrawer } from "@/components/provenance-drawer";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TrustSummary } from "@/components/ui/trust-summary";
import { apiFetch } from "@/lib/api";

type NearbyPoi = {
  name: string;
  category: string;
  distance_meters: number;
};

type InsightValue = {
  roi_band?: string;
  guidance?: string;
  pressure_level?: string;
  note?: string;
  project_estimates?: Array<{
    project: string;
    roi_range: string;
    confidence: string;
    rationale: string;
  }>;
  assumptions?: string[];
};

type Insight = {
  value?: InsightValue;
  formula_markdown?: string;
  inputs?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  freshness?: { staleness?: string; fetched_at?: string };
  computed_at?: string;
};

type ParcelDetail = {
  updated_at?: string;
  address?: string;
  parcel_number?: string;
  city?: string;
  state?: string;
  zip?: string;
  attributes_json?: { coordinates?: unknown[] };
  provenance?: {
    raw_url?: string;
    freshness?: { staleness?: string; fetched_at?: string };
  };
  timeline?: TimelineEvent[];
  nearby_pois?: NearbyPoi[];
  permits_summary?: { last_12_months_count?: number };
  flood_zone?: { intersects?: boolean; zone_code?: string };
  transit_proximity?: { score_0_100?: number };
  insights?: {
    renovation_roi?: Insight;
    insurance_pressure?: Insight;
  };
};

type TimelineEvent = {
  event_type: string;
  occurred_at: string;
  title: string;
  details: Record<string, unknown>;
};

export default function PropertyDetailPage() {
  const { status } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [data, setData] = useState<ParcelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !params.id) return;
    setLoading(true);
    setError(null);
    apiFetch<ParcelDetail>(`/parcels/${params.id}`, session?.apiToken)
      .then((payload) => setData(payload))
      .catch((err) => {
        setData(null);
        setError(err instanceof Error ? err.message : "Unable to load property");
      })
      .finally(() => setLoading(false));
  }, [session, params.id]);

  const lonLat = useMemo(() => {
    const coords = data?.attributes_json?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        return { lon, lat };
      }
    }
    return { lon: -82.9988, lat: 39.9612 };
  }, [data]);

  const timeline: TimelineEvent[] = Array.isArray(data?.timeline) ? data.timeline : [];
  const renovationEstimates = data?.insights?.renovation_roi?.value?.project_estimates ?? [];
  const renovationAssumptions = data?.insights?.renovation_roi?.value?.assumptions ?? [];

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <div data-testid="property-detail-header">
        <PageHeader
          eyebrow="Property dossier"
          title={data?.address || (loading ? "Loading property…" : "Property detail")}
          description={
            data
              ? `Parcel ${data.parcel_number} • ${data.city}, ${data.state} ${data.zip}`
              : error
                ? "The requested parcel could not be loaded from the deterministic property record."
                : "Deterministic parcel record, map context, and provenance-backed insights for operator review."
          }
          meta={
            data ? (
              <>
                <Badge variant="outline">Deterministic parcel record</Badge>
                <span>Insight cards explain saved parcel inputs. They do not overwrite parcel facts.</span>
              </>
            ) : null
          }
          actions={
            <Link
              href="/properties"
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-backgroundAlt"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to property search
            </Link>
          }
        />
      </div>

      {error ? (
        <Card className="mb-5" data-testid="property-detail-error">
          <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        </Card>
      ) : null}

      {loading ? (
        <div className="space-y-5">
          <Card className="space-y-3">
            <div className="skeleton-block h-10 w-60" />
            <div className="skeleton-block h-5 w-72" />
            <div className="grid gap-3 md:grid-cols-4">
              <div className="skeleton-block h-14" />
              <div className="skeleton-block h-14" />
              <div className="skeleton-block h-14" />
              <div className="skeleton-block h-14" />
            </div>
          </Card>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr),minmax(0,1.1fr)]">
            <div className="skeleton-block h-72" />
            <div className="space-y-4">
              <div className="skeleton-block h-40" />
              <div className="skeleton-block h-40" />
            </div>
          </div>
        </div>
      ) : data ? (
        <>
          <Card className="mb-5" data-testid="record-trust-card">
            <div className="section-heading">
              <div className="section-heading-copy">
                <p className="section-label">Trust layer</p>
                <CardTitle>Verified record</CardTitle>
                <CardDescription>
                  Parcel facts stay deterministic and auditable. Explanatory insight cards are downstream of this saved record.
                </CardDescription>
              </div>
              <Badge variant="outline">Saved parcel facts</Badge>
            </div>
            <div className="mt-5">
              <TrustSummary
                label="Saved parcel record"
                verifiedAt={data.updated_at ?? data.insights?.renovation_roi?.computed_at}
                officialUpdatedAt={data.provenance?.freshness?.fetched_at}
                freshness={data.provenance?.freshness}
                reference={data.provenance?.raw_url}
                note="Any AI-assisted explanation on this page stays downstream of the verified parcel record above."
              />
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr),minmax(0,1.05fr)]">
            <Card data-testid="property-facts-card">
              <div className="section-heading">
                <div className="section-heading-copy">
                  <p className="section-label">Quick facts</p>
                  <CardTitle>Operator scan summary</CardTitle>
                  <CardDescription>
                    Deterministic parcel facts, exposure signals, and map-ready coordinates collected from the saved record.
                  </CardDescription>
                </div>
                <div className="soft-note inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>Saved parcel facts only</span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="detail-item">
                  <p className="detail-item-label">Permits</p>
                  <p className="detail-item-value" data-testid="permits-badge">
                    {data.permits_summary?.last_12_months_count ?? "-"}
                  </p>
                </div>
                <div className="detail-item">
                  <p className="detail-item-label">Flood intersects</p>
                  <p className="detail-item-value" data-testid="flood-intersects-badge">
                    {String(data.flood_zone?.intersects ?? false)}
                  </p>
                </div>
                <div className="detail-item">
                  <p className="detail-item-label">Flood zone</p>
                  <p className="detail-item-value" data-testid="flood-zone-badge">
                    {data.flood_zone?.zone_code ?? "Unknown"}
                  </p>
                </div>
                <div className="detail-item">
                  <p className="detail-item-label">Transit score</p>
                  <p className="detail-item-value" data-testid="transit-badge">
                    {Math.round(Number(data.transit_proximity?.score_0_100 ?? 0))}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Badge variant="outline">Parcel {data.parcel_number ?? "unknown"}</Badge>
                <Badge variant="outline">{data.city ?? "Unknown city"}</Badge>
                <Badge variant="outline">{data.state ?? "Unknown state"}</Badge>
              </div>
            </Card>

            <Card data-testid="map-card">
              <div className="section-heading">
                <div className="section-heading-copy">
                  <p className="section-label">Map context</p>
                  <CardTitle>Parcel location</CardTitle>
                  <CardDescription>
                    The map uses saved parcel coordinates only. It does not infer a location from generated copy.
                  </CardDescription>
                </div>
                <div className="soft-note inline-flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-primary" />
                  <span>{lonLat.lat.toFixed(4)}, {lonLat.lon.toFixed(4)}</span>
                </div>
              </div>
              <div
                className="mt-5 overflow-hidden rounded-[24px] border border-border/70"
                role="group"
                aria-label={`Property map for ${data.address ?? "selected parcel"}`}
              >
                <PropertyMap lat={lonLat.lat} lon={lonLat.lon} />
              </div>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr),minmax(0,1.05fr)]">
            <Card data-testid="pois-card">
              <div className="section-heading">
                <div className="section-heading-copy">
                  <p className="section-label">Nearby context</p>
                  <CardTitle>Nearby points of interest</CardTitle>
                  <CardDescription>
                    Location context anchored to saved parcel coordinates for field review.
                  </CardDescription>
                </div>
              </div>

              {(data.nearby_pois || []).length ? (
                <ul
                  className="mt-5 space-y-3 text-sm"
                  data-testid="pois-list"
                  aria-label="Nearby points of interest"
                >
                  {(data.nearby_pois || []).map((poi) => (
                    <li
                      key={`${poi.name}-${poi.distance_meters}`}
                      data-testid={`poi-item-${poi.name}`}
                      className="app-panel-muted px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{poi.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{poi.category}</p>
                        </div>
                        <Badge variant="outline">{poi.distance_meters} m</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-5">
                  <EmptyState
                    icon={<Compass className="h-5 w-5" />}
                    title="No nearby POIs available"
                    description="This parcel does not currently have nearby point-of-interest context in the saved record."
                  />
                  <span className="sr-only" data-testid="pois-empty">
                    No nearby POIs available for this parcel.
                  </span>
                </div>
              )}
            </Card>

            <Card data-testid="insights-card">
              <div className="section-heading">
                <div className="section-heading-copy">
                  <p className="section-label">Insight layer</p>
                  <CardTitle>Provenance-backed guidance</CardTitle>
                  <CardDescription>
                    These guidance cards explain formula outputs from saved parcel inputs. They do not replace the parcel facts shown above.
                  </CardDescription>
                </div>
                <Badge variant="outline">Read-only explanation</Badge>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                <div
                  className="rounded-xl border border-border p-3"
                  data-testid="insight-roi-card"
                >
                  <p className="font-medium">Renovation ROI</p>
                  <p className="text-muted-foreground">
                    Band: {data.insights?.renovation_roi?.value?.roi_band || "-"}
                  </p>
                  <p className="text-muted-foreground">
                    {data.insights?.renovation_roi?.value?.guidance || "No guidance available."}
                  </p>
                </div>
                <div
                  className="rounded-xl border border-border p-3"
                  data-testid="insight-insurance-card"
                >
                  <p className="font-medium">Insurance Pressure</p>
                  <p className="text-muted-foreground">
                    Level: {data.insights?.insurance_pressure?.value?.pressure_level || "-"}
                  </p>
                  <p className="text-muted-foreground">
                    {data.insights?.insurance_pressure?.value?.note || "No note available."}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <ProvenanceDrawer
                  formula={data.insights?.renovation_roi?.formula_markdown ?? "No formula"}
                  inputs={data.insights?.renovation_roi?.inputs ?? {}}
                  provenance={data.insights?.renovation_roi?.provenance ?? {}}
                />
              </div>
            </Card>
          </div>

          <Card className="mt-5" data-testid="roi-estimator-card">
            <div className="section-heading">
              <div className="section-heading-copy">
                <p className="section-label">Renovation planner</p>
                <CardTitle>Deterministic ROI estimator</CardTitle>
                <CardDescription>
                  Estimated upgrade ranges are derived from the saved ROI band, property type mix, and neighborhood permit activity. They are directional planning aids, not guaranteed sale outcomes.
                </CardDescription>
              </div>
              <Badge variant="outline">
                {data.insights?.renovation_roi?.value?.roi_band
                  ? `${data.insights.renovation_roi.value.roi_band.replace(/^./, (value) => value.toUpperCase())} band`
                  : "Band unavailable"}
              </Badge>
            </div>

            {renovationEstimates.length ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {renovationEstimates.map((estimate) => (
                  <div key={estimate.project} className="app-panel-muted px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{estimate.project}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {estimate.roi_range}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {estimate.confidence.replace(/^./, (value) => value.toUpperCase())} confidence
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {estimate.rationale}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5">
                <EmptyState
                  title="ROI ranges are unavailable"
                  description="This parcel does not yet have enough deterministic renovation signal to produce directional project ranges."
                />
              </div>
            )}

            {renovationAssumptions.length ? (
              <div className="mt-5 rounded-[22px] border border-border/70 bg-card-muted/70 px-4 py-4">
                <p className="section-label">Assumptions</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  {renovationAssumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card className="mt-5" data-testid="timeline-card">
            <div className="section-heading">
              <div className="section-heading-copy">
                <p className="section-label">Recorded history</p>
                <CardTitle>Timeline</CardTitle>
                <CardDescription>
                  Key parcel events collected from the record for operator review.
                </CardDescription>
              </div>
            </div>

            {timeline.length ? (
              <ul
                className="mt-5 grid gap-3 lg:grid-cols-2"
                data-testid="timeline-list"
                aria-label="Property timeline"
              >
                {timeline.map((event) => (
                  <li
                    className="app-panel-muted px-4 py-4"
                    key={`${event.event_type}-${event.occurred_at}-${event.title}`}
                    data-testid={`timeline-event-${event.event_type}`}
                  >
                    <p className="font-medium text-foreground">{event.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(event.occurred_at).toLocaleString()}
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {event.event_type.replaceAll("_", " ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-5">
                <EmptyState
                  title="No timeline events recorded yet"
                  description="Once parcel events are available, they will appear here with their recorded timestamps."
                />
                <span className="sr-only" data-testid="timeline-empty">
                  No timeline events available yet.
                </span>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </SiteShell>
  );
}

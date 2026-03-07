"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { PropertyMap } from "@/components/property-map";
import { ProvenanceDrawer } from "@/components/provenance-drawer";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type NearbyPoi = {
  category: string;
  name: string;
  distance_meters: number;
};

type TimelineEvent = {
  event_type: string;
  occurred_at: string;
  title: string;
  details: Record<string, unknown>;
};

type InsightValue = {
  roi_band?: string;
  guidance?: string;
  ranges?: Record<string, string>;
  pressure_level?: string;
  note?: string;
  flood_zone_intersection?: boolean;
  zone_code?: string | null;
  distance_to_flood_zone_meters?: number;
  uncertainty?: string;
  [key: string]: unknown;
};

type Insight = {
  metric_key?: string;
  version?: string;
  formula_markdown?: string;
  computed_at?: string;
  ttl_seconds?: number;
  is_stale?: boolean;
  freshness?: Record<string, unknown>;
  value?: InsightValue;
  inputs?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  [key: string]: unknown;
};

type ParcelDetail = {
  id: string;
  parcel_number?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  attributes_json?: {
    coordinates?: [number, number];
    [key: string]: unknown;
  };
  permits_summary?: {
    last_12_months_count?: number;
    top_types?: Record<string, number>;
  };
  flood_zone?: {
    intersects?: boolean;
    zone_code?: string | null;
  };
  transit_proximity?: {
    nearest_stop?: string | null;
    distance_meters?: number | null;
    score_0_100?: number;
  };
  nearby_pois?: NearbyPoi[];
  timeline?: TimelineEvent[];
  insights?: {
    renovation_roi?: Insight;
    insurance_pressure?: Insight;
  };
  provenance?: Record<string, unknown>;
};

export default function PropertyDetailPage() {
  const { status } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [data, setData] = useState<ParcelDetail | null>(null);

  useEffect(() => {
    if (!session || !params.id) return;
    apiFetch<ParcelDetail>(`/parcels/${params.id}`, session?.apiToken)
      .then(setData)
      .catch(() => setData(null));
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

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <Card className="mb-4">
        <CardTitle>{data?.address || "Property Detail"}</CardTitle>
        <CardDescription>
          Parcel {data?.parcel_number} • {data?.city}, {data?.state} {data?.zip}
        </CardDescription>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <Badge>Permits 12M: {data?.permits_summary?.last_12_months_count ?? "-"}</Badge>
          <Badge>Flood Intersects: {String(data?.flood_zone?.intersects ?? false)}</Badge>
          <Badge>Flood Zone: {data?.flood_zone?.zone_code ?? "Unknown"}</Badge>
          <Badge>Transit Score: {Math.round(Number(data?.transit_proximity?.score_0_100 ?? 0))}</Badge>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Map</CardTitle>
          <PropertyMap lat={lonLat.lat} lon={lonLat.lon} />
        </Card>

        <Card>
          <CardTitle className="mb-3">Nearby POIs</CardTitle>
          <ul className="space-y-2 text-sm">
            {(data?.nearby_pois || []).map((poi: NearbyPoi) => (
              <li key={`${poi.name}-${poi.distance_meters}`}>
                {poi.category}: {poi.name} ({poi.distance_meters} m)
              </li>
            ))}
            {!(data?.nearby_pois || []).length ? (
              <li className="text-muted-foreground">No nearby POIs available for this parcel.</li>
            ) : null}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Insight Cards</CardTitle>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-border p-3">
              <p className="font-medium">Renovation ROI</p>
              <p className="text-muted-foreground">
                Band: {data?.insights?.renovation_roi?.value?.roi_band || "-"}
              </p>
              <p className="text-muted-foreground">
                {data?.insights?.renovation_roi?.value?.guidance || "No guidance available."}
              </p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="font-medium">Insurance Pressure</p>
              <p className="text-muted-foreground">
                Level: {data?.insights?.insurance_pressure?.value?.pressure_level || "-"}
              </p>
              <p className="text-muted-foreground">
                {data?.insights?.insurance_pressure?.value?.note || "No note available."}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <ProvenanceDrawer
              formula={data?.insights?.renovation_roi?.formula_markdown ?? "No formula"}
              inputs={data?.insights?.renovation_roi?.inputs ?? {}}
              provenance={data?.insights?.renovation_roi?.provenance ?? {}}
            />
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-3">Timeline</CardTitle>
          <ul className="space-y-2 text-sm">
            {timeline.map((event) => (
              <li className="rounded-xl border border-border p-3" key={`${event.event_type}-${event.occurred_at}-${event.title}`}>
                <p className="font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground">{new Date(event.occurred_at).toLocaleString()}</p>
              </li>
            ))}
            {!timeline.length ? <li className="text-muted-foreground">No timeline events available yet.</li> : null}
          </ul>
        </Card>
      </div>
    </SiteShell>
  );
}

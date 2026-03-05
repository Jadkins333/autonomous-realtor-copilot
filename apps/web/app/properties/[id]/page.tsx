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

export default function PropertyDetailPage() {
  const { status } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!session || !params.id) return;
    apiFetch<any>(`/parcels/${params.id}`, (session as any).apiToken)
      .then(setData)
      .catch(() => setData(null));
  }, [session, params.id]);

  const lonLat = useMemo(() => {
    const coords = data?.attributes_json?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      return { lon: Number(coords[0]), lat: Number(coords[1]) };
    }
    return { lon: -82.9988, lat: 39.9612 };
  }, [data]);

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
          <Badge>
            Transit Score: {Math.round(Number(data?.transit_proximity?.score_0_100 ?? 0))}
          </Badge>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Map</CardTitle>
          <PropertyMap lon={lonLat.lon} lat={lonLat.lat} />
        </Card>

        <Card>
          <CardTitle className="mb-3">Nearby POIs</CardTitle>
          <ul className="space-y-2 text-sm">
            {(data?.nearby_pois || []).map((poi: any) => (
              <li key={`${poi.name}-${poi.distance_meters}`}>
                {poi.category}: {poi.name} ({poi.distance_meters} m)
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle className="mb-3">Insight Cards</CardTitle>
        <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">
          {JSON.stringify(data?.insights, null, 2)}
        </pre>
        <div className="mt-3">
          <ProvenanceDrawer
            formula={data?.insights?.renovation_roi?.formula_markdown ?? "No formula"}
            inputs={data?.insights?.renovation_roi?.inputs ?? {}}
            provenance={data?.insights?.renovation_roi?.provenance ?? {}}
          />
        </div>
      </Card>
    </SiteShell>
  );
}

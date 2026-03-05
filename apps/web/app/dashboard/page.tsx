"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

export default function DashboardPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!session) return;
    apiFetch<Record<string, unknown>>("/metrics", (session as any).apiToken)
      .then(setMetrics)
      .catch(() => setMetrics(null));
  }, [session]);

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
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
      <Card className="mt-4">
        <CardTitle className="mb-3">System Metrics</CardTitle>
        <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">
          {JSON.stringify(metrics, null, 2)}
        </pre>
      </Card>
    </SiteShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

export default function DashboardPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [tourDismissed, setTourDismissed] = useState(false);

  useEffect(() => {
    if (!session) return;
    apiFetch<Record<string, unknown>>("/metrics", session?.apiToken)
      .then(setMetrics)
      .catch(() => setMetrics(null));
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
      <Card className="mt-4">
        <CardTitle className="mb-3">System Metrics</CardTitle>
        <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">
          {JSON.stringify(metrics, null, 2)}
        </pre>
      </Card>
    </SiteShell>
  );
}

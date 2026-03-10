"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarRange, Filter } from "lucide-react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api";

type EventItem = {
  id: string;
  parcel_id: string;
  address: string;
  event_type: string;
  severity: string;
  details: Record<string, unknown>;
  created_at: string;
};

type EventsResponse = {
  status: string;
  filters: Record<string, unknown>;
  items: EventItem[];
};

export default function OpportunityEventsPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [severity, setSeverity] = useState("");
  const [days, setDays] = useState("30");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("days", String(Math.max(1, Number(days) || 30)));
    if (severity.trim()) {
      params.set("severity", severity.trim());
    }
    return params.toString();
  }, [days, severity]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    apiFetch<EventsResponse>(`/opportunities/events?${query}`, session?.apiToken)
      .then((payload) => setEvents(payload.items || []))
      .catch((err) => {
        setEvents([]);
        setError(err instanceof Error ? err.message : "Unable to load event feed");
      })
      .finally(() => setLoading(false));
  }, [session, query]);

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Deterministic event feed"
        title="Opportunity events"
        description="Threshold-cross and exposure events emitted by the deterministic opportunities engine. AI does not generate these event rows or change their recorded severity."
        meta={
          <>
            <Badge variant="outline">{events.length} events</Badge>
            <span>{severity.trim() ? `severity=${severity.trim()}` : "all severities"}</span>
            <span>{Math.max(1, Number(days) || 30)} day lookback</span>
          </>
        }
        actions={
          <Link
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-backgroundAlt"
            href="/opportunities"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to opportunities
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr),minmax(0,1.12fr)]">
        <Card>
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Event filters</p>
              <CardTitle>Adjust the review window</CardTitle>
              <CardDescription>
                Narrow the event stream without changing the underlying deterministic event history.
              </CardDescription>
            </div>
            <div className="soft-note inline-flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <span>Filters only change what is shown.</span>
            </div>
          </div>

          <form className="mt-5 space-y-4" aria-label="Opportunity event filters">
            <label className="space-y-2" htmlFor="event-severity-filter">
              <span className="section-label">Event severity filter</span>
              <Input
                id="event-severity-filter"
                aria-label="Event severity filter"
                placeholder="high, medium, or low"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              />
            </label>
            <label className="space-y-2" htmlFor="event-lookback-days">
              <span className="section-label">Lookback days</span>
              <Input
                id="event-lookback-days"
                aria-label="Lookback days"
                inputMode="numeric"
                placeholder="Days"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
          </form>
        </Card>

        <Card data-testid="events-summary-card">
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Current snapshot</p>
              <CardTitle>{events.length} events in view</CardTitle>
              <CardDescription>
                Use this stream to review exactly what the deterministic engine emitted for the selected filter window.
              </CardDescription>
            </div>
            <div className="soft-note inline-flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" />
              <span>Updated as filters change</span>
            </div>
          </div>

          <div
            className="mt-5 flex flex-wrap gap-2"
            aria-live="polite"
            role="status"
            data-testid="events-summary-status"
          >
            <Badge variant="outline">{Math.max(1, Number(days) || 30)} days</Badge>
            <Badge variant="outline">
              {severity.trim() ? `Severity ${severity.trim()}` : "All severities"}
            </Badge>
            <Badge variant="outline">{events.length} events</Badge>
          </div>

          {error ? (
            <p className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Each item shown here comes from the recorded opportunities event log rather than generated narration.
            </p>
          )}
        </Card>
      </div>

      <div
        className="mt-5 space-y-3"
        data-testid="events-list"
        aria-live="polite"
        aria-busy={loading}
        aria-label="Opportunity events list"
      >
        {loading ? (
          <Card className="p-4" data-testid="events-loading">
            Loading event feed...
          </Card>
        ) : null}

        {!loading && !events.length ? (
          <div data-testid="no-events">
            <EmptyState
              title="No events found for the selected filters"
              description="Try a broader severity filter or a longer lookback window to surface more deterministic event history."
            />
          </div>
        ) : null}

        {events.map((event) => (
          <Card key={event.id} className="p-4" data-testid={`event-card-${event.id}`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{event.address}</p>
                <p
                  className="text-sm text-muted-foreground"
                  data-testid={`event-type-${event.id}`}
                >
                  {event.event_type.replaceAll("_", " ")} ({event.severity})
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{event.severity}</Badge>
                <Badge variant="outline">Parcel {event.parcel_id}</Badge>
              </div>
            </div>

            <div className="mt-4">
              <Link
                className="text-sm font-semibold text-primary underline underline-offset-4"
                href={`/properties/${event.parcel_id}`}
              >
                Open property profile
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </SiteShell>
  );
}

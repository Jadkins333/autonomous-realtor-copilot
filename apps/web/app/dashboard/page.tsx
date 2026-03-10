"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Compass,
  Copy,
  Database,
  MessageCircleHeart,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TrustSummary } from "@/components/ui/trust-summary";
import { apiFetch } from "@/lib/api";

type FreshnessInfo = {
  staleness?: string;
  fetched_at?: string;
};

type DashboardDigest = {
  generated_at?: string;
  verified_at?: string;
  overview: {
    verified_label: string;
    parcels?: number;
    messages?: number;
    drafts?: number;
    permits?: number;
    dlq_size?: number;
    last_source_run_status?: string | null;
    last_source_run_started_at?: string | null;
  };
  urgent_tasks: Array<{
    title: string;
    detail: string;
    href: string;
    severity: string;
  }>;
  market_shift: {
    status?: string;
    score_0_100?: number | null;
    rationale?: string | null;
    freshness?: FreshnessInfo | null;
    computed_at?: string | null;
    drivers?: Array<{ label: string; value: string }>;
    coverage_summary?: string | null;
    missing_inputs?: string[];
  };
  client_milestones: Array<{
    contact_id: string;
    contact_name: string;
    detail: string;
    href: string;
    kind: string;
  }>;
  follow_up_opportunities: Array<{
    parcel_id: string;
    address: string;
    heat_score: number;
    distress_score: number;
    href: string;
  }>;
  conversation_starters: {
    label: string;
    verified_facts: string[];
    variants: Array<{ tone: string; text: string }>;
    ai_generated: boolean;
    provider_label?: string | null;
  };
};

export default function DashboardPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [digest, setDigest] = useState<DashboardDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tourDismissed, setTourDismissed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    apiFetch<DashboardDigest>("/system/dashboard-digest", session.apiToken)
      .then((payload) => setDigest(payload))
      .catch((err) => {
        setDigest(null);
        setError(err instanceof Error ? err.message : "Unable to load dashboard digest");
      })
      .finally(() => setLoading(false));
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

  const copyVariant = async (tone: string, text: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopyStatus(`${tone} starter copied`);
    } catch {
      setCopyStatus(`${tone} starter ready to copy manually`);
    }
  };

  if (status !== "authenticated") {
    return null;
  }

  const urgentCount = digest?.urgent_tasks.length ?? 0;
  const marketDrivers = digest?.market_shift.drivers ?? [];
  const conversationStarters = digest?.conversation_starters.variants ?? [];

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Daily briefing"
        title="Dashboard"
        description="Deterministic daily digest, triage queue, and grounded conversation starters for the next operator moves."
        meta={
          <>
            <Badge variant="outline">
              {digest?.overview.verified_label ?? "Deterministic digest"}
            </Badge>
            <Badge variant={urgentCount > 0 ? "warning" : "success"}>
              {urgentCount > 0
                ? `${urgentCount} urgent task${urgentCount === 1 ? "" : "s"}`
                : "No urgent tasks"}
            </Badge>
            <span>
              {digest?.verified_at
                ? `Verified ${new Date(digest.verified_at).toLocaleString()}`
                : "Awaiting digest"}
            </span>
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
                  Move through the most important deterministic signals before the day turns into inbox drift.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {[
                  "Review urgent tasks",
                  "Check the market shift card",
                  "Open a high-heat parcel",
                  "Copy a verified talking point",
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

      {error ? (
        <Card className="mb-5">
          <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        </Card>
      ) : null}

      {loading ? (
        <div className="space-y-5" data-testid="dashboard-page">
          <Card className="space-y-3">
            <div className="skeleton-block h-10 w-72" />
            <div className="skeleton-block h-24" />
          </Card>
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="skeleton-block h-64" />
            <div className="skeleton-block h-64" />
          </div>
        </div>
      ) : digest ? (
        <div className="space-y-5" data-testid="dashboard-page">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr),minmax(0,0.92fr)]">
            <Card data-testid="daily-digest-card">
              <div className="section-heading">
                <div className="section-heading-copy">
                  <p className="section-label">Verified overview</p>
                  <CardTitle>Daily digest</CardTitle>
                  <CardDescription>
                    Deterministic system posture for the day. Counts and freshness come from saved source runs, parcel records, and message state.
                  </CardDescription>
                </div>
                <div className="soft-note inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>Verified facts stay authoritative</span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="detail-item">
                  <p className="detail-item-label">Tracked parcels</p>
                  <p className="detail-item-value">{digest.overview.parcels ?? 0}</p>
                </div>
                <div className="detail-item">
                  <p className="detail-item-label">Messages</p>
                  <p className="detail-item-value">{digest.overview.messages ?? 0}</p>
                </div>
                <div className="detail-item">
                  <p className="detail-item-label">Drafts</p>
                  <p className="detail-item-value">{digest.overview.drafts ?? 0}</p>
                </div>
                <div className="detail-item">
                  <p className="detail-item-label">Permit rows</p>
                  <p className="detail-item-value">{digest.overview.permits ?? 0}</p>
                </div>
              </div>

              <div className="mt-5">
                <TrustSummary
                  label="Verified daily briefing"
                  verifiedAt={digest.verified_at}
                  officialUpdatedAt={digest.overview.last_source_run_started_at}
                  freshness={digest.market_shift.freshness}
                  reference={
                    digest.overview.last_source_run_status
                      ? `Source run status: ${digest.overview.last_source_run_status}`
                      : null
                  }
                  note="AI may help phrase outreach, but it does not replace these verified metrics or any downstream compliance decisions."
                />
              </div>
            </Card>

            <Card data-testid="market-shift-card">
              <div className="section-heading">
                <div className="section-heading-copy">
                  <p className="section-label">Micro-market trend spotting</p>
                  <CardTitle>Market shift scan</CardTitle>
                  <CardDescription>
                    Deterministic neighborhood shift detection derived from public-data nowcast inputs. AI may explain the signal later, but it does not compute it.
                  </CardDescription>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-info/10 text-info">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="detail-item">
                  <p className="detail-item-label">Nowcast score</p>
                  <p className="detail-item-value">
                    {digest.market_shift.score_0_100 ?? "Unavailable"}
                  </p>
                </div>
                <div className="detail-item">
                  <p className="detail-item-label">Status</p>
                  <p className="detail-item-value">
                    {digest.market_shift.status?.replaceAll("_", " ") ?? "unknown"}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {digest.market_shift.rationale ??
                  "The current shift scan is waiting on enough deterministic source coverage to describe the market cleanly."}
              </p>

              {marketDrivers.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {marketDrivers.map((driver) => (
                    <div key={driver.label} className="app-panel-muted px-4 py-4">
                      <p className="detail-item-label">{driver.label}</p>
                      <p className="detail-item-value mt-2">{driver.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {digest.market_shift.missing_inputs?.length ? (
                <p className="mt-4 rounded-[18px] border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
                  Partial coverage: missing {digest.market_shift.missing_inputs.join(", ")}.
                </p>
              ) : null}

              <div className="mt-5">
                <TrustSummary
                  label="Deterministic market shift"
                  verifiedAt={digest.market_shift.computed_at ?? digest.verified_at}
                  officialUpdatedAt={digest.market_shift.freshness?.fetched_at}
                  freshness={digest.market_shift.freshness}
                  reference={digest.market_shift.coverage_summary ?? null}
                />
              </div>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr),minmax(0,0.95fr)]">
            <Card data-testid="urgent-tasks-card">
              <div className="section-heading">
                <div className="section-heading-copy">
                  <p className="section-label">Urgent tasks</p>
                  <CardTitle>Operator triage</CardTitle>
                  <CardDescription>
                    Anything here needs deterministic review before the day drifts out of control.
                  </CardDescription>
                </div>
                <Badge variant={urgentCount > 0 ? "warning" : "success"}>
                  {urgentCount > 0 ? `${urgentCount} queued` : "Queue clear"}
                </Badge>
              </div>

              {digest.urgent_tasks.length ? (
                <div className="mt-5 space-y-3">
                  {digest.urgent_tasks.map((task) => (
                    <div key={`${task.href}-${task.title}`} className="app-panel-muted px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{task.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{task.detail}</p>
                        </div>
                        <Badge variant={task.severity === "warning" ? "warning" : "outline"}>
                          {task.severity}
                        </Badge>
                      </div>
                      <Link
                        href={task.href}
                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
                      >
                        Open queue
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyState
                    icon={<Compass className="h-5 w-5" />}
                    title="No urgent tasks right now"
                    description="The deterministic queue is calm. Use the market shift and conversation starters below to drive proactive outreach."
                  />
                </div>
              )}
            </Card>

            <Card data-testid="follow-up-opportunities-card">
              <div className="section-heading">
                <div className="section-heading-copy">
                  <p className="section-label">Follow-up opportunities</p>
                  <CardTitle>High-signal parcels</CardTitle>
                  <CardDescription>
                    These rows are surfaced from the deterministic opportunity queue using saved parcel and event signals.
                  </CardDescription>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Database className="h-5 w-5" />
                </div>
              </div>

              {digest.follow_up_opportunities.length ? (
                <div className="mt-5 space-y-3">
                  {digest.follow_up_opportunities.map((item) => (
                    <div key={item.parcel_id} className="app-panel-muted px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{item.address}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Heat {item.heat_score} • Distress {(item.distress_score * 100).toFixed(0)}%
                          </p>
                        </div>
                        <Link
                          href={item.href}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
                        >
                          Open parcel
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyState
                    title="No follow-up parcels surfaced"
                    description="The opportunity queue is currently below the active follow-up threshold."
                  />
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr),minmax(0,1.08fr)]">
            <Card data-testid="client-milestones-card">
              <div className="section-heading">
                <div className="section-heading-copy">
                  <p className="section-label">Client milestones</p>
                  <CardTitle>Contacts needing attention</CardTitle>
                  <CardDescription>
                    Response waits and stale follow-ups derived from saved conversation history.
                  </CardDescription>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success/10 text-success">
                  <MessageCircleHeart className="h-5 w-5" />
                </div>
              </div>

              {digest.client_milestones.length ? (
                <div className="mt-5 space-y-3">
                  {digest.client_milestones.map((item) => (
                    <div key={item.contact_id} className="app-panel-muted px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{item.contact_name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                        </div>
                        <Badge variant="outline">{item.kind.replaceAll("_", " ")}</Badge>
                      </div>
                      <Link
                        href={item.href}
                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
                      >
                        Open contact
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyState
                    title="No client milestones are waiting"
                    description="Conversation history is currently caught up, so the next best moves live in the parcel and market cards."
                  />
                </div>
              )}
            </Card>

            <Card data-testid="conversation-starters-card">
              <div className="section-heading">
                <div className="section-heading-copy">
                  <p className="section-label">Conversation starters</p>
                  <CardTitle>Grounded talking points</CardTitle>
                  <CardDescription>
                    Copy-ready outreach built from verified facts. The fact list stays authoritative even if an AI-assisted phrasing layer is added later.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={digest.conversation_starters.ai_generated ? "warning" : "outline"}>
                    {digest.conversation_starters.ai_generated ? "AI-assisted copy" : "Deterministic copy"}
                  </Badge>
                  {digest.conversation_starters.provider_label ? (
                    <Badge variant="outline">{digest.conversation_starters.provider_label}</Badge>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 rounded-[22px] border border-border/70 bg-card-muted/70 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {digest.conversation_starters.label}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Verified facts are listed first so operators can inspect the grounding before copying any phrasing.
                    </p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-info/10 text-info">
                    <Sparkles className="h-5 w-5" />
                  </div>
                </div>

                {digest.conversation_starters.verified_facts.length ? (
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
                    {digest.conversation_starters.verified_facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No verified talking points were available for this digest run.
                  </p>
                )}
              </div>

              {conversationStarters.length ? (
                <div className="mt-5 space-y-3">
                  {conversationStarters.map((variant) => (
                    <div key={`${variant.tone}-${variant.text}`} className="app-panel-muted px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="section-label">{variant.tone}</p>
                          <p className="mt-2 text-sm leading-6 text-foreground">{variant.text}</p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => void copyVariant(variant.tone, variant.text)}
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyState
                    title="No talking points generated"
                    description="The digest did not have enough verified market and parcel signals to create safe conversation starters."
                  />
                </div>
              )}

              <p className="mt-4 text-sm text-muted-foreground" role="status" aria-live="polite">
                {copyStatus}
              </p>
            </Card>
          </div>
        </div>
      ) : null}
    </SiteShell>
  );
}

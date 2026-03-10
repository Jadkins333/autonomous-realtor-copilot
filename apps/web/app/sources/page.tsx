"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api";

type SourceStatusItem = {
  source_name: string;
  mode: "live" | "fixture";
  state: "ok" | "partial" | "failed" | "paused";
  reachable: boolean | null;
  is_stale: boolean;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  drift_detected: boolean;
  drift_reason: string | null;
  dlq_count: number;
  paused_reason: string | null;
  updated_at: string;
};

type SourceStatusResponse = { items: SourceStatusItem[] };

type ReplayResponse = {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped_duplicate: number;
  message: string;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StateBadge({ state }: { state: SourceStatusItem["state"] }) {
  const className =
    state === "ok"
      ? "bg-success/10 text-success"
      : state === "partial"
        ? "bg-warning/10 text-warning-foreground"
        : state === "paused"
          ? "bg-info/10 text-info"
          : "bg-destructive/10 text-destructive";
  return (
    <Badge className={className} data-testid={`state-badge-${state}`}>
      {state}
    </Badge>
  );
}

function DriftBanner({ reason }: { reason: string | null }) {
  return (
    <div
      className="mb-4 rounded-[22px] border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning-foreground"
      data-testid="drift-banner"
    >
      Drift detected{reason ? `: ${reason}` : ""}
    </div>
  );
}

export default function SourcesPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();

  const [items, setItems] = useState<SourceStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pausingSource, setPausingSource] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState("Manual pause from web admin");
  const pauseInputRef = useRef<HTMLInputElement>(null);
  const [confirmingReplay, setConfirmingReplay] = useState<string | null>(null);

  const isAdmin = useMemo(() => session?.user?.role === "admin", [session]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const response = await apiFetch<SourceStatusResponse>(
        "/sources/status",
        session.apiToken
      );
      setItems(response.items ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sources");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pausingSource) {
      setTimeout(() => pauseInputRef.current?.focus(), 50);
    }
  }, [pausingSource]);

  const submitPause = async (sourceName: string) => {
    if (!session || !isAdmin) return;
    setActionMessage(null);
    try {
      await apiFetch("/sources/" + sourceName + "/pause", session.apiToken, {
        method: "POST",
        body: JSON.stringify({
          reason: pauseReason || "Manual pause from web admin"
        })
      });
      setActionMessage(sourceName + " paused");
    } catch (err) {
      setActionMessage(
        err instanceof Error ? err.message : "Failed to pause " + sourceName
      );
    } finally {
      setPausingSource(null);
      setPauseReason("Manual pause from web admin");
      await load();
    }
  };

  const runAction = async (sourceName: string, action: "resume" | "replay") => {
    if (!session || !isAdmin) return;
    setActionMessage(null);
    try {
      if (action === "resume") {
        await apiFetch("/sources/" + sourceName + "/resume", session.apiToken, {
          method: "POST"
        });
        setActionMessage(sourceName + " resumed");
      } else {
        const replay = await apiFetch<ReplayResponse>(
          "/sources/" + sourceName + "/dlq/replay",
          session.apiToken,
          { method: "POST" }
        );
        setActionMessage(
          sourceName +
            " replay: attempted=" +
            replay.attempted +
            " succeeded=" +
            replay.succeeded +
            " failed=" +
            replay.failed
        );
      }
    } catch (err) {
      setActionMessage(
        err instanceof Error
          ? err.message
          : "Failed " + action + " for " + sourceName
      );
    } finally {
      setConfirmingReplay(null);
      await load();
    }
  };

  if (status !== "authenticated") {
    return null;
  }

  const driftCount = items.filter((item) => item.drift_detected).length;

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Connector oversight"
        title="Sources"
        description="Live ingestion health with admin actions presented in a calmer, more legible operations frame."
        meta={
          <>
            <span>
              {items.length} source{items.length === 1 ? "" : "s"}
            </span>
            {driftCount > 0 ? (
              <Badge className="bg-warning/10 text-warning-foreground">
                {driftCount} drifted
              </Badge>
            ) : null}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void load()}>
              Refresh
            </Button>
            {!isAdmin ? (
              <Badge data-testid="role-badge-readonly">
                read-only (agent role)
              </Badge>
            ) : (
              <Badge
                className="bg-success/10 text-success"
                data-testid="role-badge-admin"
              >
                admin controls enabled
              </Badge>
            )}
          </>
        }
      />

      {driftCount > 0 ? (
        <Card className="mb-5" data-testid="global-drift-banner">
          <p className="rounded-[22px] border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
            {driftCount} source{driftCount === 1 ? "" : "s"} with drift
            detected. Resolve before replaying.
          </p>
        </Card>
      ) : null}

      {actionMessage ? (
        <Card className="mb-5">
          <p
            className="text-sm text-muted-foreground"
            data-testid="action-message"
          >
            {actionMessage}
          </p>
        </Card>
      ) : null}

      {loading ? (
        <div className="space-y-4">
          <Card data-testid="loading-card">
            <div className="space-y-3">
              <div className="skeleton-block h-12" />
              <div className="skeleton-block h-28" />
            </div>
          </Card>
        </div>
      ) : null}

      {error ? (
        <Card>
          <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        </Card>
      ) : null}

      {!loading && !error ? (
        items.length === 0 ? (
          <EmptyState
            title="No sources found."
            description="Once sources are configured, this page becomes the operating console for drift checks, pause windows, and replay decisions."
          />
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <Card
                key={item.source_name}
                data-testid={`source-card-${item.source_name}`}
              >
                {item.drift_detected ? (
                  <DriftBanner reason={item.drift_reason} />
                ) : null}

                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="section-label">Source</p>
                        <CardTitle>{item.source_name}</CardTitle>
                        <CardDescription>
                          mode={item.mode}
                          {item.reachable !== null
                            ? ` · reachable=${String(item.reachable)}`
                            : ""}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StateBadge state={item.state} />
                        {item.is_stale ? (
                          <Badge
                            className="bg-accent/10 text-accent-foreground"
                            data-testid="stale-badge"
                          >
                            stale
                          </Badge>
                        ) : null}
                        {item.dlq_count > 0 ? (
                          <Badge
                            className="bg-warning/10 text-warning-foreground"
                            data-testid="dlq-badge"
                          >
                            DLQ: {item.dlq_count}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="detail-item">
                        <p className="detail-item-label">Last finished</p>
                        <p className="detail-item-value">
                          {relativeTime(item.last_run_finished_at)}
                        </p>
                      </div>
                      <div className="detail-item">
                        <p className="detail-item-label">Last success</p>
                        <p className="detail-item-value">
                          {relativeTime(item.last_success_at)}
                        </p>
                      </div>
                    </div>

                    {item.paused_reason ? (
                      <p className="soft-note">paused: {item.paused_reason}</p>
                    ) : null}

                    {item.last_error ? (
                      <p
                        className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                        data-testid="last-error"
                      >
                        error: {item.last_error}
                      </p>
                    ) : null}
                  </div>

                  <div className="w-full max-w-xl space-y-3 rounded-[24px] border border-border/70 bg-card-muted/75 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        {item.drift_detected ? (
                          <AlertTriangle className="h-5 w-5" />
                        ) : (
                          <ShieldCheck className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <p className="section-label">Admin actions</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          Pause, resume, or replay with clear confirmation.
                        </p>
                      </div>
                    </div>

                    {pausingSource === item.source_name ? (
                      <div className="space-y-3" data-testid="pause-form">
                        <Input
                          ref={pauseInputRef}
                          placeholder="Pause reason"
                          value={pauseReason}
                          onChange={(e) => setPauseReason(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              void submitPause(item.source_name);
                            if (e.key === "Escape") setPausingSource(null);
                          }}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => void submitPause(item.source_name)}
                            data-testid="pause-submit"
                          >
                            Confirm Pause
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setPausingSource(null)}
                            data-testid="pause-cancel"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={!isAdmin}
                          variant="outline"
                          onClick={() => {
                            setPausingSource(item.source_name);
                            setConfirmingReplay(null);
                          }}
                          data-testid="pause-btn"
                        >
                          Pause
                        </Button>
                        <Button
                          disabled={!isAdmin}
                          variant="outline"
                          onClick={() =>
                            void runAction(item.source_name, "resume")
                          }
                          data-testid="resume-btn"
                        >
                          Resume
                        </Button>

                        {confirmingReplay === item.source_name ? (
                          <>
                            <Button
                              variant="outline"
                              className="border-warning/20 bg-warning/10 text-warning-foreground hover:bg-warning/20"
                              onClick={() =>
                                void runAction(item.source_name, "replay")
                              }
                              data-testid="replay-confirm"
                            >
                              Confirm Replay
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => setConfirmingReplay(null)}
                              data-testid="replay-cancel"
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            disabled={!isAdmin}
                            variant="outline"
                            onClick={() => {
                              setConfirmingReplay(item.source_name);
                              setPausingSource(null);
                            }}
                            data-testid="replay-btn"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Replay DLQ
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </SiteShell>
  );
}

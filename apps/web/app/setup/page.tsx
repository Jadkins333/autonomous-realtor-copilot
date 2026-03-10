"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Bot, Copy, Database, RadioTower, Wrench } from "lucide-react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api";

type SourceStatusItem = {
  source_name: string;
  mode: string;
  state: string;
  drift_detected: boolean;
  dlq_count: number;
  last_error: string | null;
  last_run_finished_at: string | null;
};

type SourceStatusResponse = {
  items: SourceStatusItem[];
};

type DiagnosticsResponse = {
  generated_at?: string;
  build?: {
    app_name?: string;
    version?: string;
    commit_sha?: string;
  };
  db?: { ok?: boolean; message?: string };
  redis?: { ok?: boolean; message?: string };
  worker_heartbeat?: { last_seen?: string | null };
  beat_heartbeat?: { last_seen?: string | null };
  sources?: Array<{
    source_name: string;
    mode: string;
    reachable: string | boolean | null;
    message?: string;
  }>;
  env_checklist?: Record<string, boolean>;
  default_locale?: string;
  locale_notice?: string;
};

type LlmStatus = {
  llm_enabled: boolean;
  provider: string | null;
  model: string | null;
  available: boolean;
  provider_label: string | null;
};

type VoiceStatus = {
  available: boolean;
  provider?: string | null;
  reason?: string | null;
};

const COMMANDS = [
  "pnpm run project:setup",
  "pnpm run project:doctor",
  "pnpm smoke"
];

const REQUIRED_ENV_KEYS = [
  "SANDBOX_MODE",
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_API_URL",
  "EXPO_PUBLIC_API_BASE_URL",
  "DEFAULT_LOCALE"
];

function statusVariant(
  status: "good" | "warn" | "bad" | "neutral"
): "success" | "warning" | "destructive" | "outline" {
  if (status === "good") return "success";
  if (status === "warn") return "warning";
  if (status === "bad") return "destructive";
  return "outline";
}

function heartbeatLabel(value: string | null | undefined): string {
  if (!value) return "No recent heartbeat";
  return `Last seen ${new Date(value).toLocaleString()}`;
}

function formatGeneratedAt(value: string | undefined): string {
  if (!value) return "Diagnostics pending";
  return new Date(value).toLocaleString();
}

function FeatureCard({
  testId,
  icon,
  label,
  state,
  summary,
  detail,
}: {
  testId: string;
  icon: React.ReactNode;
  label: string;
  state: string;
  summary: string;
  detail: string;
}) {
  const tone =
    state === "Available" || state === "Healthy"
      ? "good"
      : state === "Unavailable" || state === "Error"
        ? "bad"
        : "warn";

  return (
    <Card className="h-full" data-testid={testId}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="space-y-2">
            <p className="section-label">{label}</p>
            <CardTitle className="text-base">{summary}</CardTitle>
          </div>
        </div>
        <Badge variant={statusVariant(tone)}>{state}</Badge>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{detail}</p>
    </Card>
  );
}

export default function SetupPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();

  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(
    null
  );
  const [sources, setSources] = useState<SourceStatusItem[]>([]);
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let mounted = true;
    const apiToken = session.apiToken;

    async function load() {
      const results = await Promise.allSettled([
        apiFetch<DiagnosticsResponse>("/system/diagnostics", apiToken),
        apiFetch<SourceStatusResponse>("/sources/status", apiToken),
        apiFetch<LlmStatus>("/copilot/llm-status", apiToken),
        apiFetch<VoiceStatus>("/outreach/voice-status", apiToken),
      ]);

      if (!mounted) return;

      const [diag, sourcePayload, llm, voice] = results;
      const failures: string[] = [];

      if (diag.status === "fulfilled") {
        setDiagnostics(diag.value);
      } else {
        failures.push(
          diag.reason instanceof Error
            ? diag.reason.message
            : "Diagnostics unavailable"
        );
      }

      if (sourcePayload.status === "fulfilled") {
        setSources(sourcePayload.value.items || []);
      } else {
        failures.push(
          sourcePayload.reason instanceof Error
            ? sourcePayload.reason.message
            : "Sources unavailable"
        );
      }

      if (llm.status === "fulfilled") {
        setLlmStatus(llm.value);
      } else {
        setLlmStatus({
          llm_enabled: false,
          provider: null,
          model: null,
          available: false,
          provider_label: null,
        });
      }

      if (voice.status === "fulfilled") {
        setVoiceStatus(voice.value);
      } else {
        setVoiceStatus({
          available: false,
          provider: null,
          reason: "Voice status endpoint unavailable.",
        });
      }

      setError(failures.length > 0 ? failures.join(" · ") : null);
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [session]);

  const envChecklist = diagnostics?.env_checklist ?? {};
  const configuredEnvCount = useMemo(
    () => REQUIRED_ENV_KEYS.filter((key) => envChecklist[key]).length,
    [envChecklist]
  );
  const sourceIssues = useMemo(
    () =>
      sources.filter(
        (source) =>
          source.state !== "ok" || source.drift_detected || Boolean(source.last_error)
      ).length,
    [sources]
  );

  const llmState = !llmStatus?.llm_enabled
    ? "Disabled"
    : llmStatus.available
      ? "Available"
      : "Unavailable";
  const llmSummary = llmStatus?.provider_label ?? llmStatus?.provider ?? "Local model";
  const llmDetail = !llmStatus?.llm_enabled
    ? "LLM features are turned off. Deterministic results and compliance logic still remain active."
    : llmStatus.available
      ? `AI-assisted narration is ready through ${llmStatus.provider_label ?? llmStatus.model ?? "the configured local provider"}. Deterministic outputs remain authoritative.`
      : `The configured local provider is not reachable right now. Copilot falls back to deterministic-only output until the local model comes back online.`;

  const voiceState = voiceStatus?.available ? "Available" : "Unavailable";
  const voiceDetail = voiceStatus?.available
    ? "Twilio voice routing is configured enough for real call attempts, but every send still depends on deterministic approval and current server send mode."
    : voiceStatus?.reason ??
      "Voice calls are unavailable until the server reports valid Twilio configuration.";

  const sourceSummary =
    sourceIssues === 0
      ? `${sources.length} source checks`
      : `${sourceIssues} source issue${sourceIssues === 1 ? "" : "s"}`;
  const sourceState = sourceIssues === 0 ? "Healthy" : "Attention";
  const sourceDetail =
    sources.length === 0
      ? "No source rows were returned yet. Once ingestion runs, source health, drift, and DLQ signals will appear here."
      : sourceIssues === 0
        ? "Source status is currently calm. Drift, reachability, and DLQ counts are all within expected ranges."
        : "One or more source rows need operator attention because they are stale, degraded, drifting, or holding a recent error.";

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // no-op
    }
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Operator console"
        title="Setup & readiness"
        description="Truthful configuration, provider, and source posture. This page reports state only. It does not run commands, override sandbox, or bypass deterministic send authority."
        meta={
          <>
            <Badge variant="outline">
              {configuredEnvCount}/{REQUIRED_ENV_KEYS.length} core env keys configured
            </Badge>
            <Badge variant={sourceIssues === 0 ? "success" : "warning"}>
              {sourceSummary}
            </Badge>
            <span>Updated {formatGeneratedAt(diagnostics?.generated_at)}</span>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr),minmax(0,0.85fr)]">
        <Card>
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Operator shortcuts</p>
              <CardTitle>Command deck</CardTitle>
              <CardDescription>
                These buttons copy commands only. They never execute from the
                browser.
              </CardDescription>
            </div>
            <div className="soft-note">
              Use setup commands locally or in the deploy console, then return
              here to verify the resulting state.
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {COMMANDS.map((command) => (
              <div
                key={command}
                className="app-panel-muted flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="section-label">Command</p>
                  <code className="mt-2 block break-all text-sm text-foreground">
                    {command}
                  </code>
                </div>
                <Button
                  variant="outline"
                  onClick={() => copyCommand(command)}
                  data-testid={`copy-cmd-${command.split(" ").at(-1)}`}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <FeatureCard
            testId="feature-card-llm"
            icon={<Bot className="h-5 w-5" />}
            label="Local LLM"
            state={llmState}
            summary={llmSummary}
            detail={llmDetail}
          />
          <FeatureCard
            testId="feature-card-voice"
            icon={<RadioTower className="h-5 w-5" />}
            label="Voice delivery"
            state={voiceState}
            summary={voiceStatus?.provider ?? "Twilio voice"}
            detail={voiceDetail}
          />
          <FeatureCard
            testId="feature-card-sources"
            icon={<Database className="h-5 w-5" />}
            label="Source monitoring"
            state={sourceState}
            summary={sourceSummary}
            detail={sourceDetail}
          />
        </div>
      </div>

      {error ? (
        <Card className="mt-5" data-testid="setup-error">
          <CardTitle>Status warning</CardTitle>
          <CardDescription className="mt-2 text-destructive">
            {error}
          </CardDescription>
        </Card>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
        <Card>
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Configuration checklist</p>
              <CardTitle>Core environment</CardTitle>
              <CardDescription>
                This reflects configured versus missing values only. It does not
                assume a provider is healthy just because a key exists.
              </CardDescription>
            </div>
            <Badge variant="outline">
              {configuredEnvCount}/{REQUIRED_ENV_KEYS.length} configured
            </Badge>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {REQUIRED_ENV_KEYS.map((key) => {
              const configured = Boolean(envChecklist[key]);
              return (
                <div
                  key={key}
                  className="app-panel-muted px-4 py-4"
                  data-testid={`env-key-${key}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{key}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {configured
                          ? "Configured in the current runtime."
                          : "Missing from the current runtime."}
                      </p>
                    </div>
                    <Badge variant={configured ? "success" : "warning"}>
                      {configured ? "configured" : "missing"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Locale & runtime notes</p>
              <CardTitle>Demo posture</CardTitle>
              <CardDescription>
                Helpful context for operators working from local fixtures or a
                partially configured environment.
              </CardDescription>
            </div>
            <div className="soft-note inline-flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <span>{diagnostics?.default_locale ?? "columbus_oh"}</span>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="soft-note">
              {diagnostics?.locale_notice ??
                "Locale fixtures are currently static and tuned for columbus_oh demo data."}
            </div>
            <div className="app-panel-muted px-4 py-4">
              <p className="section-label">Background workers</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-foreground">Worker</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {heartbeatLabel(diagnostics?.worker_heartbeat?.last_seen)}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">Beat</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {heartbeatLabel(diagnostics?.beat_heartbeat?.last_seen)}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="app-panel-muted px-4 py-4">
                <p className="section-label">Database</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="font-semibold text-foreground">
                    {diagnostics?.db?.message ?? "pending"}
                  </p>
                  <Badge
                    variant={diagnostics?.db?.ok ? "success" : "warning"}
                  >
                    {diagnostics?.db?.ok ? "healthy" : "check"}
                  </Badge>
                </div>
              </div>
              <div className="app-panel-muted px-4 py-4">
                <p className="section-label">Redis</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="font-semibold text-foreground">
                    {diagnostics?.redis?.message ?? "pending"}
                  </p>
                  <Badge
                    variant={diagnostics?.redis?.ok ? "success" : "warning"}
                  >
                    {diagnostics?.redis?.ok ? "healthy" : "check"}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr),minmax(0,0.9fr)]">
        <Card>
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Source posture</p>
              <CardTitle>Connector readiness</CardTitle>
              <CardDescription>
                Drift, DLQ counts, and recent errors are surfaced here first so
                operator follow-up stays grounded in deterministic state.
              </CardDescription>
            </div>
          </div>

          {sources.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No source status rows found"
                description="Run ingestion or diagnostics locally to populate source status. Once rows exist, this page shows stale, drifted, and errored connectors clearly."
              />
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {sources.map((source) => {
                const tone =
                  source.state === "ok" &&
                  !source.drift_detected &&
                  !source.last_error
                    ? "success"
                    : source.drift_detected || source.last_error
                      ? "warning"
                      : "outline";
                return (
                  <div
                    key={source.source_name}
                    className="app-panel-muted px-4 py-4"
                    data-testid={`source-row-${source.source_name}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          {source.source_name}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          mode={source.mode} · state={source.state} · dlq=
                          {source.dlq_count}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={tone}>{source.state}</Badge>
                        {source.drift_detected ? (
                          <Badge variant="warning">drift</Badge>
                        ) : null}
                      </div>
                    </div>
                    {source.last_error ? (
                      <p className="mt-3 text-sm text-destructive">
                        {source.last_error}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Raw detail</p>
              <CardTitle>System diagnostics</CardTitle>
              <CardDescription>
                Use this for deeper operator inspection after the higher-level
                cards above have pointed you to the right layer.
              </CardDescription>
            </div>
          </div>

          <details className="mt-5" open>
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Expand diagnostics JSON
            </summary>
            <pre
              className="mt-4 overflow-auto rounded-[24px] border border-border/70 bg-card-muted/80 p-4 text-xs text-foreground"
              data-testid="diagnostics-pre"
              tabIndex={0}
              aria-label="System diagnostics JSON"
            >
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          </details>
        </Card>
      </div>
    </SiteShell>
  );
}

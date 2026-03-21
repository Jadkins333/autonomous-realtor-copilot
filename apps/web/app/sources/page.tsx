'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Info,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldOff,
  XCircle,
} from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { apiFetch } from "@/lib/api";

type SourceStatusItem = {
  source_name: string;
  mode: "live" | "fixture";
  state: "ok" | "partial" | "failed" | "paused";
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

const STATE_CONFIG: Record<
  SourceStatusItem["state"],
  { color: string; bg: string; border: string; icon: typeof CheckCircle2 }
> = {
  ok: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  partial: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  paused: { icon: Pause, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  failed: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
};

const SOURCE_DISPLAY: Record<string, { label: string; description: string }> = {
  franklin_auditor: { label: "Franklin County Auditor", description: "Parcel ownership, valuations, sales history" },
  arcgis_permits: { label: "ArcGIS Permits", description: "Building permits, code violations, inspections" },
  fema_nfhl: { label: "FEMA NFHL", description: "National Flood Hazard Layer zone data" },
  osm_gtfs: { label: "OSM / GTFS Transit", description: "OpenStreetMap + COTA bus/rail proximity" },
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function SourcesPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const apiToken = (session as { apiToken?: string; user?: { role?: string } } | null)?.apiToken;
  const isAdmin = ((session as { user?: { role?: string } } | null)?.user?.role || "") === "admin";

  const [items, setItems] = useState<SourceStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiToken) {
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch<SourceStatusResponse>("/sources/status", apiToken);
      setItems(response.items || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sources");
    } finally {
      setLoading(false);
    }
  }, [apiToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (name: string, action: "pause" | "resume" | "replay") => {
      if (!apiToken || !isAdmin) {
        return;
      }

      setActing(`${name}-${action}`);
      setActionMsg(null);

      try {
        if (action === "pause") {
          const reason = window.prompt("Pause reason", "Manual pause from web admin") || "Manual pause from web admin";
          await apiFetch(`/sources/${name}/pause`, apiToken, {
            method: "POST",
            body: JSON.stringify({ reason })
          });
          setActionMsg(`✓ ${name} paused`);
        } else if (action === "resume") {
          await apiFetch(`/sources/${name}/resume`, apiToken, { method: "POST" });
          setActionMsg(`✓ ${name} resumed`);
        } else {
          const replay = await apiFetch<ReplayResponse>(`/sources/${name}/dlq/replay`, apiToken, { method: "POST" });
          setActionMsg(`✓ ${name} DLQ replay: ${replay.succeeded}/${replay.attempted} succeeded`);
        }
      } catch (err) {
        setActionMsg(`✗ ${err instanceof Error ? err.message : `Failed ${action}`}`);
      } finally {
        setActing(null);
        await load();
      }
    },
    [apiToken, isAdmin, load]
  );

  const driftCount = useMemo(() => items.filter((item) => item.drift_detected).length, [items]);

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Database className="h-5 w-5 text-orange-400" />
            Data Sources
          </h1>
          <p className="mt-0.5 text-sm text-white/40">
            Ingestion status, drift flags, and operator controls
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Admin controls enabled
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] text-white/40">
              <ShieldOff className="h-3 w-3" />
              Read-only
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 transition-all hover:bg-white/[0.08] hover:text-white/85 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {(actionMsg || error) && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs ${
            error || actionMsg?.startsWith("✗")
              ? "border-red-500/20 bg-red-500/8 text-red-300"
              : "border-emerald-500/20 bg-emerald-500/8 text-emerald-300"
          }`}
        >
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          {error || actionMsg}
        </div>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <MetricCard label="Sources" value={String(items.length)} />
        <MetricCard label="Drift Flags" value={String(driftCount)} warn={driftCount > 0} />
        <MetricCard label="DLQ Total" value={String(items.reduce((sum, item) => sum + item.dlq_count, 0))} />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.06] py-16 text-center">
              <Database className="mx-auto mb-3 h-10 w-10 text-white/15" />
              <p className="text-sm text-white/40">No sources found</p>
            </div>
          ) : (
            items.map((item) => {
              const stateConfig = STATE_CONFIG[item.state];
              const StateIcon = stateConfig.icon;
              const display = SOURCE_DISPLAY[item.source_name] || {
                label: item.source_name,
                description: "Ingestion source"
              };

              return (
                <div key={item.source_name} className="rounded-xl border border-white/[0.08] bg-[#13161f] p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-1 flex items-center gap-2.5">
                        <p className="text-sm font-semibold text-white">{display.label}</p>
                        <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${stateConfig.bg} ${stateConfig.color} ${stateConfig.border}`}>
                          <StateIcon className="h-2.5 w-2.5" />
                          {item.state}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            item.mode === "live"
                              ? "border-green-500/20 bg-green-500/10 text-green-400"
                              : "border-amber-500/20 bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {item.mode}
                        </span>
                      </div>
                      <p className="text-xs text-white/35">{display.description}</p>
                    </div>
                    {item.dlq_count > 0 && (
                      <span className="rounded-full border border-red-500/25 bg-red-500/15 px-2.5 py-1 text-[10px] font-bold text-red-300">
                        {item.dlq_count} in DLQ
                      </span>
                    )}
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-3">
                    <MetaLine icon={<Clock className="h-3 w-3" />}>
                      Last run: {formatTimestamp(item.last_run_finished_at)}
                    </MetaLine>
                    <MetaLine icon={<CheckCircle2 className="h-3 w-3" />}>
                      Last success: {formatTimestamp(item.last_success_at)}
                    </MetaLine>
                    {item.drift_detected && (
                      <MetaLine icon={<AlertTriangle className="h-3 w-3" />} tone="warn">
                        Drift: {item.drift_reason || "detected"}
                      </MetaLine>
                    )}
                    {item.paused_reason && (
                      <MetaLine icon={<Pause className="h-3 w-3" />} tone="info">
                        Paused: {item.paused_reason}
                      </MetaLine>
                    )}
                    {item.last_error && (
                      <MetaLine icon={<XCircle className="h-3 w-3" />} tone="error" fullWidth>
                        Error: {item.last_error}
                      </MetaLine>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <ActionButton
                      label="Pause"
                      icon={<Pause className="h-3 w-3" />}
                      disabled={!isAdmin || item.state === "paused" || Boolean(acting)}
                      loading={acting === `${item.source_name}-pause`}
                      onClick={() => void runAction(item.source_name, "pause")}
                    />
                    <ActionButton
                      label="Resume"
                      icon={<Play className="h-3 w-3" />}
                      disabled={!isAdmin || item.state !== "paused" || Boolean(acting)}
                      loading={acting === `${item.source_name}-resume`}
                      onClick={() => void runAction(item.source_name, "resume")}
                    />
                    <ActionButton
                      label="Replay DLQ"
                      icon={<RotateCcw className="h-3 w-3" />}
                      disabled={!isAdmin || item.dlq_count === 0 || Boolean(acting)}
                      loading={acting === `${item.source_name}-replay`}
                      onClick={() => void runAction(item.source_name, "replay")}
                      warn
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </SiteShell>
  );
}

function MetricCard({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#13161f] p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${warn ? "text-amber-400" : "text-white"}`}>{value}</p>
    </div>
  );
}

function MetaLine({
  children,
  fullWidth = false,
  icon,
  tone = "muted"
}: {
  children: ReactNode;
  fullWidth?: boolean;
  icon: ReactNode;
  tone?: "muted" | "warn" | "info" | "error";
}) {
  const className =
    tone === "warn"
      ? "text-amber-400/70"
      : tone === "info"
        ? "text-blue-400/70"
        : tone === "error"
          ? "text-red-400/70"
          : "text-white/35";

  return (
    <div className={`flex items-center gap-1.5 ${className} ${fullWidth ? "col-span-full" : ""}`}>
      {icon}
      <span className={fullWidth ? "truncate" : ""}>{children}</span>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  disabled,
  loading,
  onClick,
  warn = false
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  warn?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
        warn
          ? "border-amber-500/20 bg-amber-500/8 text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/15"
          : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white/80"
      }`}
    >
      {loading ? <span className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-current" /> : icon}
      {label}
    </button>
  );
}

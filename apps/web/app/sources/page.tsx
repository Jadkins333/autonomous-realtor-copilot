'use client'

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Database,
  RefreshCw,
  Pause,
  Play,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldOff,
  Info,
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
type ReplayResponse = { attempted: number; succeeded: number; failed: number; skipped_duplicate: number; message: string };

const STATE_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; border: string }> = {
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

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type SourceStatusResponse = { items: SourceStatusItem[] }

type ReplayResponse = {
  attempted: number
  succeeded: number
  failed: number
  skipped_duplicate: number
  message: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StateBadge({ state }: { state: SourceStatusItem['state'] }) {
  const className =
    state === 'ok'
      ? 'bg-green-500/20 text-green-200'
      : state === 'partial'
        ? 'bg-amber-500/20 text-amber-200'
        : state === 'paused'
          ? 'bg-blue-500/20 text-blue-200'
          : 'bg-red-500/20 text-red-200'
  return (
    <Badge className={className} data-testid={`state-badge-${state}`}>
      {state}
    </Badge>
  )
}

function DriftBanner({ reason }: { reason: string | null }) {
  return (
    <div
      className='mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300'
      data-testid='drift-banner'
    >
      ⚠ Drift detected{reason ? `: ${reason}` : ''}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SourcesPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [items, setItems] = useState<SourceStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  // Inline pause form: tracks which source is being paused + the typed reason.
  const [pausingSource, setPausingSource] = useState<string | null>(null)
  const [pauseReason, setPauseReason] = useState('Manual pause from web admin')
  const pauseInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await apiFetch<SourceStatusResponse>("/sources/status", (session as any).apiToken);
      setItems(res.items || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources')
    } finally {
      setLoading(false)
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const runAction = async (name: string, action: "pause" | "resume" | "replay") => {
    if (!session || !isAdmin) return;
    setActionMsg(null);
    setActing(`${name}-${action}`);
    try {
      if (action === "pause") {
        const reason = window.prompt("Pause reason", "Manual pause from web admin") || "Manual pause from web admin";
        await apiFetch(`/sources/${name}/pause`, (session as any).apiToken, {
          method: "POST", body: JSON.stringify({ reason }),
        });
        setActionMsg(`✓ ${name} paused`);
      } else if (action === "resume") {
        await apiFetch(`/sources/${name}/resume`, (session as any).apiToken, { method: "POST" });
        setActionMsg(`✓ ${name} resumed`);
      } else {
        const r = await apiFetch<ReplayResponse>(`/sources/${name}/dlq/replay`, (session as any).apiToken, { method: "POST" });
        setActionMsg(`✓ ${name} DLQ replay: ${r.succeeded}/${r.attempted} succeeded`);
      }
    } catch (err) {
      setActionMsg(`✗ ${err instanceof Error ? err.message : `Failed ${action}`}`);
    } finally {
      setActing(null);
      await load();
    }
  };

  if (status !== "authenticated") return null;

  if (status !== 'authenticated') {
    return null
  }

  const driftCount = items.filter((i) => i.drift_detected).length

  return (
    <SiteShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-orange-400" />
            Data Sources
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            Ingestion pipeline status · pause/resume/replay controls
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isAdmin ? (
            <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-white/[0.06] text-white/40 border border-white/[0.08]">
              <ShieldOff className="w-3 h-3" /> Read-only (agent role)
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" /> Admin controls enabled
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white/80 hover:bg-white/[0.08] flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className={`flex items-center gap-2 mb-4 px-4 py-2.5 rounded-lg border text-xs ${
          actionMsg.startsWith("✓")
            ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-300"
            : "bg-red-500/8 border-red-500/20 text-red-300"
        }`}>
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          {actionMsg}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-lg border bg-red-500/8 border-red-500/20 text-xs text-red-300">
          <XCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-white/[0.06]">
              <Database className="w-10 h-10 text-white/15 mb-3" />
              <p className="text-white/40 text-sm">No sources found</p>
            </div>
          )}
          {items.map((item) => {
            const cfg = STATE_CONFIG[item.state] || STATE_CONFIG.failed;
            const StateIcon = cfg.icon;
            const display = SOURCE_DISPLAY[item.source_name] || { label: item.source_name, description: "Ingestion source" };
            return (
              <div key={item.source_name} className="rounded-xl border border-white/[0.08] bg-[#13161f] p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2.5 mb-1">
                      <p className="text-sm font-semibold text-white">{display.label}</p>
                      <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                        <StateIcon className="w-2.5 h-2.5" />
                        {item.state}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        item.mode === "live"
                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}>
                        {item.mode}
                      </span>
                    </div>
                    <p className="text-xs text-white/35">{display.description}</p>
                  </div>

                  {item.dlq_count > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/25 flex-shrink-0">
                      {item.dlq_count} in DLQ
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 mb-4 text-[11px]">
                  <div className="flex items-center gap-1.5 text-white/35">
                    <Clock className="w-3 h-3" />
                    <span>Last run: {fmt(item.last_run_finished_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/35">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Last success: {fmt(item.last_success_at)}</span>
                  </div>
                  {item.drift_detected && (
                    <div className="flex items-center gap-1.5 text-amber-400/70">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Drift: {item.drift_reason || "detected"}</span>
                    </div>
                  )}
                  {item.paused_reason && (
                    <div className="flex items-center gap-1.5 text-blue-400/70">
                      <Pause className="w-3 h-3" />
                      <span>Paused: {item.paused_reason}</span>
                    </div>
                  )}
                  {item.last_error && (
                    <div className="col-span-full flex items-center gap-1.5 text-red-400/70">
                      <XCircle className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">Error: {item.last_error}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <ActionButton
                    label="Pause"
                    icon={<Pause className="w-3 h-3" />}
                    disabled={!isAdmin || item.state === "paused" || !!acting}
                    loading={acting === `${item.source_name}-pause`}
                    onClick={() => void runAction(item.source_name, "pause")}
                  />
                  <ActionButton
                    label="Resume"
                    icon={<Play className="w-3 h-3" />}
                    disabled={!isAdmin || item.state !== "paused" || !!acting}
                    loading={acting === `${item.source_name}-resume`}
                    onClick={() => void runAction(item.source_name, "resume")}
                  />
                  <ActionButton
                    label="Replay DLQ"
                    icon={<RotateCcw className="w-3 h-3" />}
                    disabled={!isAdmin || item.dlq_count === 0 || !!acting}
                    loading={acting === `${item.source_name}-replay`}
                    onClick={() => void runAction(item.source_name, "replay")}
                    warn
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SiteShell>
  )
}

function ActionButton({
  label, icon, disabled, loading, onClick, warn,
}: {
  label: string; icon: React.ReactNode; disabled: boolean;
  loading: boolean; onClick: () => void; warn?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
        warn
          ? "border-amber-500/20 bg-amber-500/8 text-amber-400 hover:bg-amber-500/15 hover:border-amber-500/30"
          : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/80 hover:bg-white/[0.07]"
      }`}
    >
      {loading ? <span className="w-3 h-3 rounded-full border border-t-current border-white/20 animate-spin" /> : icon}
      {label}
    </button>
  );
}

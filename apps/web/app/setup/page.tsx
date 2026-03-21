"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Settings,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  MapPin,
  Activity,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
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

type SourceStatusResponse = { items: SourceStatusItem[] };

const COMMANDS = [
  { cmd: "pnpm run project:setup", desc: "Full project bootstrap" },
  { cmd: "pnpm run project:doctor", desc: "Validate env + connectivity" },
  { cmd: "pnpm smoke", desc: "Run smoke test suite" },
];

const REQUIRED_ENV_KEYS = [
  "SANDBOX_MODE",
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_API_URL",
  "EXPO_PUBLIC_API_BASE_URL",
  "DEFAULT_LOCALE",
];

export default function SetupPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const apiToken = (session as { apiToken?: string } | null)?.apiToken;
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [sources, setSources] = useState<SourceStatusItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);

  useEffect(() => {
    if (!apiToken) return;
    let mounted = true;
    (async () => {
      try {
        setError(null);
        const [diag, sourcePayload] = await Promise.all([
          apiFetch<Record<string, unknown>>("/system/diagnostics", apiToken),
          apiFetch<SourceStatusResponse>("/sources/status", apiToken),
        ]);
        if (!mounted) return;
        setDiagnostics(diag);
        setSources(sourcePayload.items || []);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load setup diagnostics");
      }
    })();
    return () => { mounted = false; };
  }, [apiToken]);

  const copyCommand = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(cmd);
      setTimeout(() => setCopiedCmd(null), 2000);
    } catch { /* no-op */ }
  };

  if (status !== "authenticated") return null;

  const envChecklist = (diagnostics?.env_checklist as Record<string, boolean> | undefined) || {};
  const allConfigured = REQUIRED_ENV_KEYS.every((k) => !!envChecklist[k]);
  const configuredCount = REQUIRED_ENV_KEYS.filter((k) => !!envChecklist[k]).length;

  return (
    <SiteShell>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-orange-400" />
          Setup &amp; Health
        </h1>
        <p className="text-white/40 text-sm mt-0.5">
          System diagnostics, environment checks, and developer commands
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 mb-5 px-4 py-2.5 rounded-lg border bg-red-500/8 border-red-500/20 text-xs text-red-300">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Dev commands */}
      <div className="rounded-xl border border-white/[0.08] bg-[#13161f] overflow-hidden mb-4">
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-white/40" />
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Developer Commands</p>
          <span className="ml-auto text-[10px] text-white/25">Click to copy — does not run from browser</span>
        </div>
        <div className="p-3 space-y-2">
          {COMMANDS.map(({ cmd, desc }) => (
            <button
              key={cmd}
              onClick={() => void copyCommand(cmd)}
              className="w-full flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.10] px-4 py-3 transition-all group"
            >
              <div className="text-left">
                <code className="text-xs font-mono text-white/70 group-hover:text-white transition-colors">{cmd}</code>
                <p className="text-[10px] text-white/30 mt-0.5">{desc}</p>
              </div>
              <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ml-4 flex-shrink-0 ${
                copiedCmd === cmd
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                  : "bg-white/[0.04] text-white/30 border-white/[0.06] group-hover:text-white/60"
              }`}>
                {copiedCmd === cmd ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedCmd === cmd ? "Copied!" : "Copy"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Env checklist */}
      <div className="rounded-xl border border-white/[0.08] bg-[#13161f] overflow-hidden mb-4">
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-3.5 h-3.5 ${allConfigured ? "text-emerald-400" : "text-amber-400"}`} />
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Environment Checklist</p>
          </div>
          <span className={`text-xs font-bold ${allConfigured ? "text-emerald-400" : "text-amber-400"}`}>
            {configuredCount}/{REQUIRED_ENV_KEYS.length} configured
          </span>
        </div>
        <div className="p-3 grid gap-2 sm:grid-cols-2">
          {REQUIRED_ENV_KEYS.map((key) => {
            const configured = !!envChecklist[key];
            return (
              <div key={key} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                configured
                  ? "border-emerald-500/15 bg-emerald-500/5"
                  : "border-amber-500/15 bg-amber-500/5"
              }`}>
                <code className="text-xs font-mono text-white/60">{key}</code>
                <span className={`text-[10px] font-semibold ${configured ? "text-emerald-400" : "text-amber-400"}`}>
                  {configured ? "✓ set" : "missing"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Locale */}
      <div className="rounded-xl border border-white/[0.08] bg-[#13161f] p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-3.5 h-3.5 text-white/40" />
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Locale</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-semibold text-white">
            {String(diagnostics?.default_locale || "columbus_oh")}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25">
            Demo market
          </span>
        </div>
        <p className="text-xs text-amber-400/70 mt-2">
          {String(diagnostics?.locale_notice || "Locale fixtures are currently static and tuned for columbus_oh demo data.")}
        </p>
      </div>

      {/* Sources summary */}
      {sources.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#13161f] overflow-hidden mb-4">
          <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-white/40" />
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Source Status</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {sources.map((s) => (
              <div key={s.source_name} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-xs font-medium text-white/70">{s.source_name}</p>
                  <p className="text-[10px] text-white/30">mode: {s.mode}</p>
                </div>
                <div className="flex items-center gap-2">
                  {s.dlq_count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
                      {s.dlq_count} DLQ
                    </span>
                  )}
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    s.state === "ok"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : s.state === "paused"
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  }`}>
                    {s.state}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw diagnostics accordion */}
      <div className="rounded-xl border border-white/[0.08] bg-[#13161f] overflow-hidden">
        <button
          onClick={() => setDiagOpen(!diagOpen)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-white/30" />
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Raw Diagnostics JSON</p>
          </div>
          {diagOpen ? <ChevronDown className="w-3.5 h-3.5 text-white/30" /> : <ChevronRight className="w-3.5 h-3.5 text-white/30" />}
        </button>
        {diagOpen && (
          <div className="border-t border-white/[0.06] p-4">
            <pre className="text-[10px] text-white/35 overflow-auto max-h-64 font-mono leading-relaxed">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </SiteShell>
  );
}

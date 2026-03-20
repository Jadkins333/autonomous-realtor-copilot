"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Zap, TrendingUp, AlertTriangle, ArrowRight, Filter, RefreshCw } from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { apiFetch } from "@/lib/api";

type OpportunityItem = {
  parcel_id: string;
  address: string;
  parcel_number: string;
  city: string;
  state: string;
  zip: string;
  opportunity_flags: string[];
  status: "ok" | "insufficient_data";
  missing_inputs: string[];
  event_signal?: {
    count_30d?: number;
    latest?: {
      event_type?: string;
      severity?: string;
      created_at?: string;
    } | null;
  };
  neighborhood_heat: {
    value?: { score_0_100?: number };
  };
  distress_likelihood: {
    value?: { score_0_1?: number };
  };
};

type OpportunitiesResponse = {
  status: "ok" | "insufficient_data";
  model_version: string;
  items: OpportunityItem[];
};

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  flood_exposure: { label: "Flood Risk", color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  distress_signal: { label: "Distress Signal", color: "bg-red-500/15 text-red-300 border-red-500/30" },
  permit_activity: { label: "Active Permits", color: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  open_violation: { label: "Open Violation", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

function HeatBar({ score }: { score: number }) {
  const color = score >= 60 ? "bg-red-400" : score >= 35 ? "bg-amber-400" : "bg-blue-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-xs font-bold text-white/80">{Math.round(score)}</span>
    </div>
  );
}

export default function OpportunitiesPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [payload, setPayload] = useState<OpportunitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [minHeat, setMinHeat] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      const data = await apiFetch<OpportunitiesResponse>("/opportunities", (session as any).apiToken);
      setPayload(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (status !== "authenticated" || !session) return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status]);

  const rows = useMemo(() => {
    const all = payload?.items || [];
    return all.filter((item) => Number(item.neighborhood_heat?.value?.score_0_100 || 0) >= minHeat);
  }, [payload, minHeat]);

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Opportunities
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            {rows.length} lead{rows.length !== 1 ? "s" : ""} · ranked by heat score · public data sourced
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/opportunities/events"
            className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white/80 hover:bg-white/[0.08] flex items-center gap-1.5 transition-all"
          >
            Event log <ArrowRight className="w-3 h-3" />
          </Link>
          <button
            onClick={load}
            disabled={refreshing}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white/80 hover:bg-white/[0.08] flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-4 mb-5 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.03]">
        <Filter className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
        <label className="text-xs text-white/50 flex-shrink-0">Min Heat</label>
        <input
          aria-label="Minimum heat score"
          className="flex-1 appearance-none h-1 rounded-full bg-white/10 accent-orange-500 cursor-pointer"
          max={100}
          min={0}
          onChange={(e) => setMinHeat(Number(e.target.value))}
          step={5}
          type="range"
          value={minHeat}
        />
        <span className="text-xs font-bold text-orange-400 w-7 text-right">{minHeat}</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <TrendingUp className="w-10 h-10 text-white/20 mb-3" />
          <p className="text-white/50 text-sm">No leads match your filter</p>
          <p className="text-white/25 text-xs mt-1">Try lowering the minimum heat score</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const heat = Number(row.neighborhood_heat?.value?.score_0_100 || 0);
            const distress = Number(row.distress_likelihood?.value?.score_0_1 || 0);
            const isHigh = distress >= 0.55;
            return (
              <div
                key={row.parcel_id}
                className="rounded-xl border border-white/[0.08] bg-[#13161f] p-5 hover:border-white/[0.14] transition-all group"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="font-semibold text-white text-sm group-hover:text-orange-300 transition-colors">
                      {row.address}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      #{row.parcel_number} · {row.city}, {row.state} {row.zip}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-white/40">Heat</span>
                      <HeatBar score={heat} />
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${isHigh ? "bg-red-500/15 text-red-300 border-red-500/30" : "bg-white/[0.06] text-white/50 border-white/[0.08]"}`}>
                      {(distress * 100).toFixed(0)}% distress
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(row.opportunity_flags || []).length ? (
                    row.opportunity_flags.map((flag) => {
                      const def = FLAG_LABELS[flag] || { label: flag.replace(/_/g, " "), color: "bg-white/[0.06] text-white/50 border-white/[0.08]" };
                      return (
                        <span key={flag} className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${def.color}`}>
                          {def.label}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.06] text-white/30">No active flags</span>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.06] bg-white/[0.03] text-white/40">
                    {Number(row.event_signal?.count_30d || 0)} events (30d)
                  </span>
                </div>

                {row.status === "insufficient_data" && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
                    <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                    <p className="text-[10px] text-amber-300">
                      Partial signal — missing: {row.missing_inputs.join(", ") || "source inputs"}. No scores were fabricated.
                    </p>
                  </div>
                )}

                <Link
                  href={`/properties/${row.parcel_id}`}
                  className="text-xs text-orange-400/80 hover:text-orange-300 flex items-center gap-1 transition-colors"
                >
                  Open property profile <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </SiteShell>
  );
}

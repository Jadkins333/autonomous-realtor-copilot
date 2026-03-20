"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  MapPin,
  Building2,
  Activity,
  Droplets,
  Bus,
  Clock,
  ExternalLink,
  Share2,
  FileCheck2,
  TrendingUp,
  AlertTriangle,
  Info,
  ShieldCheck,
  ChevronRight,
  Zap,
} from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { apiFetch } from "@/lib/api";

type PropertyDetail = {
  id: string;
  address: string;
  parcel_number: string;
  city: string;
  state: string;
  zip: string;
  updated_at: string;
  source_origin: string;
  freshness: {
    fetched_at: string;
    is_stale: boolean;
    staleness: string;
  };
  permits_summary: {
    last_12_months_count: number;
    top_types: Record<string, number>;
  };
  flood_zone: {
    intersects: boolean;
    zone_code: string | null;
  };
  nearby_pois: Array<{
    category: string;
    name: string;
    distance_meters: number;
  }>;
  transit_proximity: {
    nearest_stop: string | null;
    distance_meters: number | null;
    score_0_100: number;
  };
  timeline: Array<{
    event_type: string;
    occurred_at: string;
    title: string;
    details: any;
  }>;
  insights: {
    renovation_roi?: {
      value: {
        roi_band: string;
        guidance: string;
      };
    };
    insurance_pressure?: {
      value: {
        pressure_level: string;
        note: string;
      };
    };
    intelligence_verdict: string;
    truth_layer: {
      ingestion_sources: Array<{
        name: string;
        status: string;
        last_sync: string | null;
      }>;
      logic_proof: string;
    };
  };
  attributes_json: Record<string, any>;
};

export default function PropertyDetailPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const { id } = useParams();
  const [prop, setProp] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTruth, setShowTruth] = useState(false);

  useEffect(() => {
    if (!session || !id) return;
    setLoading(true);
    apiFetch<PropertyDetail>(`/parcels/${id}`, (session as any).apiToken)
      .then(setProp)
      .catch(() => setProp(null))
      .finally(() => setLoading(false));
  }, [session, id]);

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      {/* Back button & Actions */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/properties"
          className="inline-flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white/70 transition-colors uppercase tracking-widest"
        >
          <ArrowLeft className="w-4 h-4" /> Properties
        </Link>
        <div className="flex gap-2">
          <ActionIcon icon={<Share2 className="w-4 h-4" />} />
          <ActionIcon icon={<ExternalLink className="w-4 h-4" />} />
        </div>
      </div>

      {!loading && prop ? (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25 uppercase tracking-wider">
                  Parcel #{prop.parcel_number}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  prop.freshness?.staleness === "fresh"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}>
                  <Activity className="w-2.5 h-2.5" /> {prop.freshness?.staleness.toUpperCase()} AUDITED
                </span>
              </div>
              <h1 className="text-4xl font-bold text-white tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {prop.address}
              </h1>
              <div className="flex items-center gap-3 text-white/40 text-sm mt-3">
                <div className="flex items-center gap-1.5 border-r border-white/10 pr-3">
                  <span className="font-semibold text-white/60">Owner:</span> {prop.attributes_json?.owner || "N/A"}
                </div>
                <div className="flex items-center gap-1.5 border-r border-white/10 pr-3">
                  <span className="font-semibold text-white/60">Use:</span> {prop.attributes_json?.land_use || "N/A"}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-white/60">Built:</span> {prop.attributes_json?.year_built || "N/A"}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <p className="text-xs text-white/30 font-bold uppercase tracking-widest leading-none mb-1">Estimated Value</p>
              <p className="text-3xl font-bold text-white tracking-tight leading-none">
                ${(prop.attributes_json?.total_value || 0).toLocaleString()}
              </p>
            </div>
          </div>

          {/* INTELLIGENCE VERDICT - THE WOW BAR */}
          <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 overflow-hidden shadow-[0_0_20px_rgba(249,115,22,0.1)]">
             <div className="bg-orange-500/10 px-6 py-4 border-b border-orange-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <Zap className="w-5 h-5 text-orange-400 fill-orange-400/20" />
                   <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest">Autonomous Intelligence Verdict</h2>
                </div>
                <button
                   onClick={() => setShowTruth(!showTruth)}
                   className={cn(
                     "text-[10px] font-bold transition-all flex items-center gap-1.5 px-3 py-1 rounded-full border",
                     showTruth 
                       ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" 
                       : "text-white/30 hover:text-white/60 border-white/[0.08]"
                   )}
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> THE TRUTH LAYER
                </button>
             </div>
             <div className="p-6">
                <p className="text-lg text-white font-medium leading-relaxed italic">
                  &ldquo;{prop.insights?.intelligence_verdict || "No intelligence verdict available for this parcel."}&rdquo;
                </p>
             </div>
          </div>

          {/* Truth Layer Modal (Dynamic) */}
          {showTruth && (
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6 space-y-4 animate-in fade-in slide-in-from-top-4 shadow-[0_0_30px_rgba(99,102,241,0.1)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Formula Provenance (Truth Layer)</h3>
                </div>
                <div className="text-[10px] font-mono text-indigo-400/60 uppercase">Deterministic · Verified</div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <p className="text-xs text-white/50 font-bold uppercase tracking-widest flex items-center gap-2">
                      <Database className="w-3 h-3" /> Ingestion Sources
                    </p>
                    <ul className="space-y-2">
                       {prop.insights?.truth_layer?.ingestion_sources?.map((source, i) => (
                         <li key={i} className="flex items-center justify-between text-[11px] bg-white/[0.03] p-2.5 rounded-lg border border-white/[0.06]">
                            <span className="text-white/70">{source.name}</span>
                            <div className="flex flex-col items-end">
                              <span className="text-emerald-400 font-bold">{source.status}</span>
                              {source.last_sync && (
                                <span className="text-[9px] text-white/20 mt-0.5">
                                  {new Date(source.last_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                         </li>
                       ))}
                    </ul>
                 </div>
                 <div className="space-y-2">
                    <p className="text-xs text-white/50 font-bold uppercase tracking-widest flex items-center gap-2">
                       <Cpu className="w-3 h-3" /> Logic Proof
                    </p>
                    <div className="font-mono text-[10px] text-white/40 bg-black/40 p-3 rounded-lg border border-white/[0.06] h-[74px] overflow-auto leading-relaxed">
                       {prop.insights?.truth_layer?.logic_proof || "No logic proof provided."}
                    </div>
                 </div>
              </div>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatBox
              label="Active Permits"
              value={prop.permits_summary?.last_12_months_count || 0}
              icon={<Building2 className="w-4 h-4" />}
              sub="Last 12 Mos"
            />
            <StatBox
              label="Flood Risk"
              value={prop.flood_zone?.zone_code || "X"}
              icon={<Droplets className="w-4 h-4" />}
              sub={prop.flood_zone?.intersects ? "Intersects Zone" : "Safe Zone"}
              trend={prop.flood_zone?.intersects ? "down" : "up"}
            />
            <StatBox
              label="Transit Score"
              value={Math.round(prop.transit_proximity?.score_0_100 || 0)}
              icon={<Bus className="w-4 h-4" />}
              sub="GTFS Verified"
            />
            <StatBox
              label="Data Freshness"
              value={prop.freshness?.staleness === "fresh" ? "HIGH" : "SYNC"}
              icon={<ShieldCheck className="w-4 h-4" />}
              sub={prop.freshness?.staleness.toUpperCase()}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Col: Map & POI */}
            <div className="lg:col-span-2 space-y-6">
              {/* Map Placeholder */}
              <div className="aspect-video w-full rounded-2xl bg-black/20 border border-white/[0.08] relative overflow-hidden group">
                <div className="absolute inset-0 flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-orange-500/50 group-hover:scale-110 transition-transform" />
                  <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest absolute bottom-4">Interactive Parcel View</p>
                </div>
                {/* Visual grid overlay for map aesthetic */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
              </div>

              {/* Nearby POI */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {prop.nearby_pois?.map((poi, idx) => (
                  <div key={idx} className="rounded-xl border border-white/[0.06] bg-[#13161f] p-3 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-white/30 uppercase tracking-widest truncate">{poi.category}</p>
                      <p className="text-xs font-bold text-white truncate">{poi.name}</p>
                    </div>
                    <p className="text-[10px] font-mono text-white/40 whitespace-nowrap ml-2">{poi.distance_meters}m</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Col: Insights & Timeline */}
            <div className="space-y-6">
              {/* Insights */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" /> Intelligence Findings
                </p>
                
                {prop.insights?.renovation_roi && (
                  <div className="rounded-2xl border border-white/[0.08] bg-[#13161f] p-4 group hover:border-white/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border-emerald-500/30`}>
                        ROI POTENTIAL
                      </span>
                      <ChevronRight className="w-3 h-3 text-white/20 group-hover:text-white/50 transition-colors" />
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Renovation Yield: {prop.insights.renovation_roi.value.roi_band.toUpperCase()}</h4>
                    <p className="text-xs text-white/40 leading-relaxed">{prop.insights.renovation_roi.value.guidance}</p>
                  </div>
                )}

                {prop.insights?.insurance_pressure && (
                  <div className="rounded-2xl border border-white/[0.08] bg-[#13161f] p-4 group hover:border-white/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                        prop.insights.insurance_pressure.value.pressure_level === "elevated" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      }`}>
                        INSURANCE RISK
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Pressure Level: {prop.insights.insurance_pressure.value.pressure_level.toUpperCase()}</h4>
                    <p className="text-xs text-white/40 leading-relaxed">{prop.insights.insurance_pressure.value.note}</p>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" /> Possession & Event Chain
                </p>
                <div className="relative pl-4 space-y-6 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-px before:bg-white/[0.08]">
                  {prop.timeline?.map((t, idx) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-5 w-2 h-2 rounded-full bg-white/[0.15] border-3 border-[#0f1117] z-10" />
                      <div>
                        <p className="text-[10px] font-mono text-white/20 tracking-tighter mb-1">
                          {new Date(t.occurred_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs font-bold text-white/70">{t.title}</p>
                        <p className="text-[11px] text-white/40 mt-0.5 truncate">{t.event_type.toUpperCase()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="w-12 h-12 text-white/10 mb-4" />
          <h2 className="text-white font-bold">Property Not Found</h2>
          <p className="text-white/30 text-sm mt-1">We couldn&apos;t retrieve intelligence records for this parcel.</p>
        </div>
      )}
    </SiteShell>
  );
}

function StatBox({ label, value, icon, sub, trend }: any) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#13161f] p-5 flex items-start gap-4">
      <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white/30 flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs text-white/30 font-bold uppercase tracking-widest leading-none mb-2">{label}</p>
        <p className={`text-xl font-bold tracking-tight leading-none ${trend === 'down' ? 'text-orange-400' : 'text-white'}`}>{value}</p>
        <p className="text-[10px] text-white/20 font-medium mt-1 uppercase tracking-tighter truncate">{sub}</p>
      </div>
    </div>
  );
}

function ActionIcon({ icon }: any) {
  return (
    <button className="p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70 hover:bg-white/10 transition-all">
      {icon}
    </button>
  );
}

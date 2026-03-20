"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Activity,
  Zap,
  Target,
  ArrowUpRight,
  TrendingUp,
  Map,
  ShieldCheck,
  Building2,
  Clock,
  ChevronRight,
  FileSearch,
} from "lucide-react";
import Link from "next/link";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { apiFetch } from "@/lib/api";

type MetricGroup = {
  parcels: number;
  opportunities: number;
  outreach: number;
  events: number;
};

type PriorityLead = {
  id: string;
  address: string;
  distress: number;
  roi: string;
  verdict: string;
  tag: string;
};

export default function DashboardPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [metrics, setMetrics] = useState<MetricGroup | null>(null);
  const [loading, setLoading] = useState(true);

  // Real Database IDs for the "Wow" Tour
  const priorityLeads: PriorityLead[] = [
    { id: "cf3c5097-51dd-4270-b8fd-7c48d7bb9afd", address: "145 N High St", distress: 0.85, roi: "12.4%", verdict: "Stalled Renovation / High Distress", tag: "Hot" },
    { id: "1a4aefb6-d731-4fe6-a046-ff02b21c2809", address: "3508 Indianola Ave", distress: 0.65, roi: "8.1%", verdict: "Permit Expired / Flood Zone Risk", tag: "Review" },
    { id: "11111111-1111-1111-1111-111111111111", address: "999 Missing Signal Ln", distress: 0.42, roi: "15.2%", verdict: "High Transit / Undervalued Asset", tag: "Value" },
  ];

  useEffect(() => {
    if (!session) return;
    apiFetch<MetricGroup>("/system/metrics", (session as any).apiToken)
      .then(setMetrics)
      .catch(() => setMetrics({ parcels: 0, opportunities: 0, outreach: 0, events: 0 }))
      .finally(() => setLoading(false));
  }, [session]);

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      {/* Welcome Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25 uppercase tracking-wider">
            Columbus, OH · Live Intelligence
          </span>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          Good morning, {session?.user?.name || "Agent"}
        </h1>
        <p className="text-white/40 text-sm mt-1">
          The copilot is online. We found <span className="text-white/70 font-bold">{metrics?.events || 0} intelligence events</span> in the last 24h.
        </p>
      </div>

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Cataloged Parcels"
          value={metrics?.parcels?.toLocaleString() || "0"}
          subValue="Franklin County Auditor"
          icon={<Building2 className="w-4 h-4" />}
          color="blue"
        />
        <StatCard
          label="Active Distressed"
          value={metrics?.opportunities?.toLocaleString() || "0"}
          subValue="Priority Targets"
          icon={<Target className="w-4 h-4" />}
          color="orange"
        />
        <StatCard
          label="Outreach Drafts"
          value={metrics?.outreach?.toLocaleString() || "0"}
          subValue="Awaiting Review"
          icon={<Zap className="w-4 h-4" />}
          color="pink"
        />
        <StatCard
          label="Pipeline Events"
          value={metrics?.events?.toLocaleString() || "0"}
          subValue="Live Monitoring"
          icon={<Activity className="w-4 h-4" />}
          color="emerald"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Priority Pipeline - THE WOW WIDGET */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-400" />
              High-Conviction Leads
            </h2>
            <Link href="/opportunities" className="text-xs text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1">
              View All Pipeline <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid gap-3">
            {loading ? (
              [1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />)
            ) : (
              priorityLeads.map(lead => (
                <Link key={lead.id} href={`/properties/${lead.id}`} className="block group">
                  <div className="rounded-2xl border border-white/[0.08] bg-[#13161f] p-4 group-hover:bg-white/[0.02] group-hover:border-orange-500/30 transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-white text-base font-semibold">{lead.address}</p>
                        <p className="text-white/30 text-xs mt-0.5">{lead.verdict}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          lead.id.startsWith('cf3c') ? "bg-orange-500/15 text-orange-400 border-orange-500/25" :
                          lead.id.startsWith('1111') ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" :
                          "bg-blue-500/15 text-blue-400 border-blue-500/25"
                        }`}>
                          {lead.tag}
                        </span>
                        <div className="flex flex-col items-end">
                           <p className="text-xs text-white/30 font-medium">ROI</p>
                           <p className="text-sm font-bold text-white leading-none">{lead.roi}</p>
                        </div>
                      </div>
                    </div>
                    {/* Heat bar visualization */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-600 to-orange-400"
                          style={{ width: `${lead.distress * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-tighter w-12 text-right">
                        {(lead.distress * 100).toFixed(0)}% Heat
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Intelligence Actions & Capabilities */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest px-2">
            Intelligence Hub
          </h2>

          <div className="grid gap-3">
            <HubCard
              href="/copilot"
              title="Launch AI Copilot"
              desc="Deep-dive into parcel histories, ownership traces, and market ROI analysis."
              icon={<ShieldCheck className="w-5 h-5 text-indigo-400" />}
            />
            <HubCard
              href="/outreach"
              title="Generate Campaigns"
              desc="Draft compliant outreach for distressed leads automatically."
              icon={<Zap className="w-5 h-5 text-pink-400" />}
            />
            <HubCard
              href="/properties"
              title="Property Explorer"
              desc="Geospatial search across Franklin County public records."
              icon={<Map className="w-5 h-5 text-blue-400" />}
            />
            <HubCard
              href="/setup"
              title="Truth Layer Health"
              desc="Audit system diagnostics & live ingestion feeds."
              icon={<FileSearch className="w-5 h-5 text-amber-400" />}
            />
          </div>

          {/* Activity Strip */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#13161f] p-5">
            <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> Recent Intel
            </p>
            <div className="space-y-4">
               <ActivityItem msg="New Permit: 145 N High St (Roofing)" time="2m ago" />
               <ActivityItem msg="Heat Alert: 43215 Neighborhood heating up" time="15m ago" />
               <ActivityItem msg="Audit Complete: F.C. Auditor Ingestion" time="1h ago" />
            </div>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}

function StatCard({ label, value, subValue, icon, color }: any) {
  const colors: any = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    pink: "text-pink-400 bg-pink-500/10 border-pink-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#13161f] p-5 flex flex-col justify-between hover:border-white/20 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-xl border ${colors[color]}`}>
          {icon}
        </div>
        <ArrowUpRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        <p className="text-xs font-medium text-white/40 mt-1">{label}</p>
        <div className="h-px bg-white/[0.05] my-2" />
        <p className="text-[10px] text-white/25 truncate">{subValue}</p>
      </div>
    </div>
  );
}

function HubCard({ href, title, desc, icon }: any) {
  return (
    <Link href={href} className="block group">
      <div className="rounded-2xl border border-white/[0.08] bg-[#13161f] p-4 flex gap-4 items-center group-hover:bg-white/[0.02] group-hover:border-white/20 transition-all">
        <div className="flex-shrink-0 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-bold text-white group-hover:text-orange-400 transition-colors">{title}</h3>
          <p className="text-xs text-white/30 mt-0.5 leading-relaxed">{desc}</p>
        </div>
      </div>
    </Link>
  );
}

function ActivityItem({ msg, time }: any) {
  return (
    <div className="flex items-center justify-between gap-3 group">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-1 h-1 rounded-full bg-orange-500/50 group-hover:scale-150 transition-transform" />
        <p className="text-[11px] text-white/50 truncate pr-2 group-hover:text-white/70 transition-colors">{msg}</p>
      </div>
      <span className="text-[10px] text-white/20 font-mono flex-shrink-0">{time}</span>
    </div>
  );
}

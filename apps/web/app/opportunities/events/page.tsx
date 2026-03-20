"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Activity, ArrowLeft, Filter, AlertTriangle, Clock, ChevronDown, ChevronRight } from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
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

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: "text-red-300", bg: "bg-red-500/15", border: "border-red-500/25" },
  high: { color: "text-orange-300", bg: "bg-orange-500/15", border: "border-orange-500/25" },
  medium: { color: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/25" },
  low: { color: "text-blue-300", bg: "bg-blue-500/15", border: "border-blue-500/25" },
};

const DAY_OPTIONS = [7, 14, 30, 60, 90];
const SEVER_OPTIONS = ["", "critical", "high", "medium", "low"];

export default function OpportunityEventsPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [severity, setSeverity] = useState("");
  const [days, setDays] = useState("30");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("days", String(Math.max(1, Number(days) || 30)));
    if (severity.trim()) params.set("severity", severity.trim());
    return params.toString();
  }, [days, severity]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    apiFetch<EventsResponse>(`/opportunities/events?${query}`, (session as any).apiToken)
      .then((payload) => setEvents(payload.items || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [session, query]);

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/opportunities"
            className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 mb-2 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Opportunities
          </Link>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-orange-400" />
            Event Log
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            Threshold-cross and exposure events from the opportunities engine
          </p>
        </div>
        <div className="text-xs text-white/30 font-medium">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <Filter className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">Window</span>
          <div className="flex gap-1">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(String(d))}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  days === String(d)
                    ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                    : "bg-white/[0.03] text-white/40 border-white/[0.06] hover:text-white/70 hover:bg-white/[0.06]"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">Severity</span>
          <div className="flex gap-1">
            {SEVER_OPTIONS.map((s) => (
              <button
                key={s || "all"}
                onClick={() => setSeverity(s)}
                className={`text-xs px-2.5 py-1 rounded-lg border capitalize transition-all ${
                  severity === s
                    ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                    : "bg-white/[0.03] text-white/40 border-white/[0.06] hover:text-white/70 hover:bg-white/[0.06]"
                }`}
              >
                {s || "All"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-white/[0.06]">
          <Activity className="w-10 h-10 text-white/15 mb-3" />
          <p className="text-white/40 text-sm">No events found</p>
          <p className="text-white/25 text-xs mt-1">Try a wider window or different severity filter</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const sev = (event.severity || "low").toLowerCase();
            const cfg = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.low;
            const isExpanded = expandedId === event.id;
            const hasDetails = Object.keys(event.details || {}).length > 0;
            return (
              <div
                key={event.id}
                className="rounded-xl border border-white/[0.08] bg-[#13161f] overflow-hidden"
              >
                <div
                  className={`flex items-center justify-between px-5 py-3.5 ${hasDetails ? "cursor-pointer hover:bg-white/[0.02]" : ""} transition-colors`}
                  onClick={() => hasDetails && setExpandedId(isExpanded ? null : event.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.color}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white/80 truncate">{event.address}</p>
                      <p className="text-xs text-white/35 capitalize">
                        {event.event_type.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                      {event.severity}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-white/30">
                      <Clock className="w-3 h-3" />
                      {new Date(event.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    {hasDetails && (
                      isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-white/25" />
                        : <ChevronRight className="w-3.5 h-3.5 text-white/25" />
                    )}
                  </div>
                </div>
                {isExpanded && hasDetails && (
                  <div className="px-5 pb-4 border-t border-white/[0.04]">
                    <pre className="mt-3 text-[10px] font-mono text-white/35 bg-white/[0.02] rounded-lg p-3 overflow-auto max-h-40 border border-white/[0.04]">
                      {JSON.stringify(event.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SiteShell>
  );
}

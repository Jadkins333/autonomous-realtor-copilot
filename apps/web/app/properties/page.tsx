"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Search,
  Building2,
  ChevronRight,
  TrendingUp,
  MapPin,
  AlertTriangle,
  Zap,
  Filter,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";

import { useRequireAuth } from "../../components/auth-guard";
import { SiteShell } from "../../components/site-shell";
import { apiFetch } from "../../lib/api";

type PropertyResult = {
  id: string;
  address: string;
  parcel_number: string;
  city: string;
  state: string;
  zip: string;
  source_origin: string;
  freshness: {
    staleness: string;
  };
  disclosure_status: {
    allowed: boolean;
  };
};

export default function PropertiesPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PropertyResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    if (!session || !query.trim()) return;
    setLoading(true);
    try {
      const data = await apiFetch<PropertyResult[]>(
        `/parcels/search?query=${encodeURIComponent(query)}`,
        (session as any).apiToken
      );
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      {/* Search Header Area */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
          <Building2 className="w-8 h-8 text-orange-400" />
          Property Surveillance
        </h1>

        <div className="relative group max-w-2xl">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-orange-400 transition-colors" />
          <input
            placeholder="Search address, zip, or parcel ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full bg-[#13161f] border border-white/[0.08] rounded-2xl pl-14 pr-32 py-5 text-lg text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/40 transition-all shadow-2xl shadow-black/50"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? "Searching..." : "SURVEIL"}
          </button>
        </div>

        {/* Filters / Quick Suggestions */}
        <div className="flex gap-2 mt-4">
           <FilterPill label="High Distress" active />
           <FilterPill label="Zone AE (Flood)" />
           <FilterPill label="Transit +80" />
           <FilterPill label="Auditor Verified" />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 rounded-2xl border border-white/[0.06] bg-[#13161f] animate-pulse" />
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.map((prop) => (
            <Link key={prop.id} href={`/properties/${prop.id}`} className="group">
              <div className="rounded-2xl border border-white/[0.08] bg-[#13161f] p-5 hover:bg-white/[0.02] hover:border-orange-500/30 transition-all flex flex-col h-full shadow-lg">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5 fill-orange-400/20" /> DISTRESS LEVEL
                    </span>
                    <p className="text-base font-bold text-white group-hover:text-orange-400 transition-colors leading-tight">
                      {prop.address}
                    </p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors" />
                </div>

                {/* Distress Gauge */}
                <div className="mb-4">
                  <div className="flex justify-between text-[10px] font-bold text-white/30 uppercase tracking-tighter mb-1.5">
                    <span>Low Exposure</span>
                    <span className="text-orange-500/80">Critical</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.05] flex gap-1 items-stretch p-[2px]">
                    {[...Array(10)].map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-[1px] transition-all duration-500 delay-[${i * 50}ms] ${
                          i < (0.5) * 10
                            ? i > 7 ? "bg-orange-500" : "bg-orange-600/60"
                            : "bg-white/5"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap gap-1.5">
                  {[prop.source_origin, prop.freshness?.staleness].filter(Boolean).map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/[0.04] text-white/40 border border-white/[0.06] uppercase tracking-wider"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="ml-auto text-[10px] text-white/20 font-mono">#{prop.parcel_number}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/[0.06] rounded-3xl">
          <Building2 className="w-12 h-12 text-white/10 mb-4" />
          <h3 className="text-white font-bold text-lg">Initialize Search</h3>
          <p className="text-white/30 text-sm max-w-xs mt-1">
            Search 10,000+ Franklin County records to identify high-distress investment opportunities.
          </p>
        </div>
      )}
    </SiteShell>
  );
}

function FilterPill({ label, active }: any) {
  return (
    <button className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
      active
        ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
        : "bg-white/[0.03] text-white/30 border-white/[0.06] hover:text-white/50 hover:border-white/20"
    }`}>
      {label}
    </button>
  );
}

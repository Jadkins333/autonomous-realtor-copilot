"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Building2, Search } from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type PropertyResult = {
  id: string;
  address: string;
  parcel_number: string;
  city: string;
  state: string;
  zip: string;
  source_origin: string;
  freshness?: { staleness?: string };
};

export default function PropertiesPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PropertyResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!session?.apiToken || !query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const data = await apiFetch<PropertyResult[]>(
        `/parcels/search?q=${encodeURIComponent(query.trim())}`,
        session.apiToken,
      );
      setResults(data);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-400/80">Property Search</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Find the property, then push the workflow forward.</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/45">
          Search public-record properties, inspect the profile, and capture the lead into your pipeline with tasks.
        </p>
      </div>

      <Card className="border-white/[0.08] bg-[#13161f] text-white">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
            <Input
              className="border-white/10 bg-white/[0.03] pl-10 text-white placeholder:text-white/25"
              placeholder="Search by address or parcel number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <Button className="bg-orange-500 text-white hover:bg-orange-400" disabled={searching} onClick={handleSearch}>
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {results.map((property) => (
          <Link key={property.id} href={`/properties/${property.id}`}>
            <Card className="h-full border-white/[0.08] bg-[#13161f] text-white transition hover:border-orange-500/30 hover:bg-white/[0.03]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-white">{property.address}</CardTitle>
                  <CardDescription className="mt-2 text-white/45">
                    #{property.parcel_number} · {property.city}, {property.state} {property.zip}
                  </CardDescription>
                </div>
                <Building2 className="h-5 w-5 text-orange-300" />
              </div>
              <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.18em]">
                <span className="text-white/35">{property.source_origin.replace(/_/g, " ")}</span>
                <span className="text-orange-300">{property.freshness?.staleness || "unknown"}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {!searching && !results.length ? (
        <Card className="mt-6 border-dashed border-white/[0.08] bg-transparent text-white/35">
          Search a property to open the profile, review negotiation/context signals, and capture it into the pipeline.
        </Card>
      ) : null}
    </SiteShell>
  );
}

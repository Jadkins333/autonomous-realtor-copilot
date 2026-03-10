"use client";

import React, { useState } from "react";
import Link from "next/link";
import { getSession } from "next-auth/react";
import { Database, Search } from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

type ParcelRow = {
  id: string;
  address: string;
  parcel_number: string;
  city: string;
  updated_at: string;
};

export default function PropertiesPage() {
  const { status } = useRequireAuth();
  const [query, setQuery] = useState("High");
  const [rows, setRows] = useState<ParcelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function search() {
    setLoading(true);
    setSearchError(null);
    setHasSearched(true);
    try {
      const freshSession = await getSession();
      const token = freshSession?.apiToken;
      const data = await apiFetch<ParcelRow[]>(
        `/parcels/search?query=${encodeURIComponent(query)}`,
        token,
      );
      setRows(data);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Property records"
        title="Property hub search"
        description="Search deterministic parcel records by address fragment or parcel number, then open the full property profile for the authoritative record."
        meta={
          <>
            <Badge variant="outline">Deterministic parcel search</Badge>
            <span>No AI ranking or generated parcel data.</span>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr),minmax(0,1.08fr)]">
        <Card>
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Search parcels</p>
              <CardTitle>Authoritative property lookup</CardTitle>
              <CardDescription>
                Use the parcel index to find a specific record fast. Results come
                from saved parcel data only, so operators can trust the address,
                city, and parcel number shown here.
              </CardDescription>
            </div>
            <div className="soft-note">
              Search stays deterministic and never fabricates new parcel rows.
            </div>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <label className="space-y-2" htmlFor="property-search-input">
              <span className="section-label">Property search query</span>
              <Input
                id="property-search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                data-testid="property-search-input"
                placeholder="Enter an address fragment or parcel number"
                aria-describedby="property-search-help"
              />
            </label>
            <p
              className="text-sm leading-6 text-muted-foreground"
              id="property-search-help"
            >
              Search examples: street names, parcel numbers, or short address
              fragments. No AI ranking or generated parcel data is applied here.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                data-testid="property-search-btn"
                type="submit"
                disabled={loading || !query.trim()}
              >
                <Search className="h-4 w-4" />
                {loading ? "Searching..." : "Search parcels"}
              </Button>
              <span className="text-sm text-muted-foreground">
                {hasSearched
                  ? `${rows.length} result${rows.length === 1 ? "" : "s"} returned`
                  : "Run a search to load matching parcels."}
              </span>
            </div>
          </form>

          {searchError ? (
            <div
              className="mt-4 rounded-[20px] border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              data-testid="search-error"
              role="alert"
            >
              {searchError}
            </div>
          ) : null}
        </Card>

        <Card data-testid="property-results-card">
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Search results</p>
              <CardTitle>Matching parcel records</CardTitle>
              <CardDescription>
                Narrow-screen browsing uses card summaries first, while the
                desktop table preserves dense scanning for operators.
              </CardDescription>
            </div>
            <Badge variant="outline">
              {loading ? "Searching" : `${rows.length} shown`}
            </Badge>
          </div>

          {loading ? (
            <div
              className="mt-5 app-panel-muted px-4 py-4 text-sm text-muted-foreground"
              data-testid="property-loading-state"
              aria-live="polite"
            >
              Searching parcel records...
            </div>
          ) : null}

          {!loading && rows.length > 0 ? (
            <>
              <div className="mt-5 grid gap-3 md:hidden">
                {rows.map((row) => (
                  <Card
                    key={row.id}
                    className="border border-border/70 bg-card-muted/60 shadow-none"
                    data-testid={`property-card-${row.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          className="text-base font-semibold text-foreground underline decoration-accent/40 underline-offset-4 transition-colors hover:text-accent"
                          href={`/properties/${row.id}`}
                        >
                          {row.address}
                        </Link>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Parcel {row.parcel_number}
                        </p>
                      </div>
                      <Badge variant="outline">{row.city}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Updated {new Date(row.updated_at).toLocaleString()}
                    </p>
                  </Card>
                ))}
              </div>

              <div className="mt-5 hidden md:block">
                <Table>
                  <thead>
                    <tr>
                      <Th>Address</Th>
                      <Th>Parcel</Th>
                      <Th>City</Th>
                      <Th>Updated</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} data-testid={`property-row-${row.id}`}>
                        <Td>
                          <Link
                            className="text-accent underline underline-offset-4"
                            href={`/properties/${row.id}`}
                          >
                            {row.address}
                          </Link>
                        </Td>
                        <Td>{row.parcel_number}</Td>
                        <Td>{row.city}</Td>
                        <Td>{new Date(row.updated_at).toLocaleString()}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          ) : null}

          {!loading && rows.length === 0 ? (
            <div className="mt-5" data-testid="property-empty-state">
              <EmptyState
                icon={<Database className="h-5 w-5" />}
                title={
                  hasSearched
                    ? "No parcel records matched"
                    : "Search to load parcel records"
                }
                description={
                  hasSearched
                    ? "Try a broader address fragment or a different parcel number. The search remains deterministic and only returns saved parcel rows."
                    : "Enter an address fragment or parcel number, then run a search to open authoritative property records."
                }
              />
            </div>
          ) : null}
        </Card>
      </div>
    </SiteShell>
  );
}

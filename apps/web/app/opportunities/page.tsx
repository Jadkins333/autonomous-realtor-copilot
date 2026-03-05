"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type ParcelRow = {
  id: string;
  address: string;
  parcel_number: string;
  city: string;
  updated_at: string;
};

export default function OpportunitiesPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [rows, setRows] = useState<ParcelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "authenticated" || !session) return;

    let mounted = true;
    (async () => {
      try {
        const data = await apiFetch<ParcelRow[]>(
          "/parcels/search?query=High",
          (session as any).apiToken
        );
        if (mounted) {
          setRows(data);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [session, status]);

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <Card className="mb-4">
        <CardTitle>Opportunities</CardTitle>
        <CardDescription>
          Seeded opportunity feed from public-data parcel activity for demo mode.
        </CardDescription>
      </Card>

      <div className="space-y-3">
        {loading ? <Card className="p-4">Loading opportunities...</Card> : null}

        {!loading && rows.length === 0 ? (
          <Card className="p-4">No opportunities available in current dataset.</Card>
        ) : null}

        {rows.map((row) => (
          <Card key={row.id} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{row.address}</p>
                <p className="text-sm text-muted-foreground">Parcel {row.parcel_number}</p>
              </div>
              <Badge variant="secondary">{row.city}</Badge>
            </div>
            <div className="mt-3">
              <Link className="text-sm text-accent underline" href={`/properties/${row.id}`}>
                Open property profile
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </SiteShell>
  );
}

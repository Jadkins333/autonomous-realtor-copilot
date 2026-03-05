"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

export default function PropertiesPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [query, setQuery] = useState("High");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!session) return;
    setLoading(true);
    try {
      const data = await apiFetch<any[]>(
        `/parcels/search?query=${encodeURIComponent(query)}`,
        (session as any).apiToken
      );
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <Card className="mb-4">
        <CardTitle>Property Hub Search</CardTitle>
        <CardDescription>Find parcels by address fragment or parcel number.</CardDescription>
        <div className="mt-4 flex gap-2">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} />
          <Button onClick={search}>{loading ? "Searching..." : "Search"}</Button>
        </div>
      </Card>

      <Card>
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
              <tr key={row.id}>
                <Td>
                  <Link className="text-accent underline" href={`/properties/${row.id}`}>
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
      </Card>
    </SiteShell>
  );
}

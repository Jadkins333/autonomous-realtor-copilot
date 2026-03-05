"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { apiFetch } from "@/lib/api";

type SourceStatusItem = {
  source_name: string;
  mode: "live" | "fixture";
};

type SourceStatusResponse = {
  items: SourceStatusItem[];
};

const CACHE_KEY = "fixture-mode-status-cache";
const CACHE_TTL_MS = 30_000;
const CRITICAL_SOURCES = new Set([
  "franklin_auditor",
  "columbus_arcgis_permits",
  "fema_nfhl",
  "osm_overpass",
  "cota_gtfs",
]);

export function FixtureModeBanner() {
  const { data: session } = useSession();
  const [items, setItems] = useState<SourceStatusItem[]>([]);

  useEffect(() => {
    const cached = typeof window !== "undefined" ? window.sessionStorage.getItem(CACHE_KEY) : null;
    if (!cached) return;
    try {
      const payload = JSON.parse(cached) as { timestamp: number; items: SourceStatusItem[] };
      if (Date.now() - payload.timestamp <= CACHE_TTL_MS) {
        setItems(payload.items);
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;

    const load = async () => {
      try {
        const response = await apiFetch<SourceStatusResponse>("/sources/status", (session as any).apiToken);
        if (!active) return;
        setItems(response.items || []);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ timestamp: Date.now(), items: response.items || [] })
          );
        }
      } catch {
        // Keep previous status on transient failures.
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, CACHE_TTL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [session]);

  const fixtureEnabled = useMemo(() => {
    return items.some((item) => CRITICAL_SOURCES.has(item.source_name) && item.mode === "fixture");
  }, [items]);

  if (!fixtureEnabled) {
    return null;
  }

  return (
    <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-200/10 px-3 py-2 text-sm text-amber-100">
      Fixture mode: demo data in use. Live sources not connected.
    </div>
  );
}

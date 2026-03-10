"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef } from "react";

import maplibregl from "maplibre-gl";

export function PropertyMap({ lon, lat }: { lon: number; lat: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const safeLon = Number.isFinite(lon) ? lon : -82.9988;
  const safeLat = Number.isFinite(lat) ? lat : 39.9612;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [safeLon, safeLat],
      zoom: 13,
      interactive: false,
    });

    return () => {
      map.remove();
    };
  }, [safeLon, safeLat]);

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-2xl border">
      <div className="h-full w-full" ref={containerRef} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-[0_0_0_6px_rgba(234,88,12,0.22)]"
      />
    </div>
  );
}

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
      zoom: 13
    });

    new maplibregl.Marker({ color: "#ea580c" }).setLngLat([safeLon, safeLat]).addTo(map);

    return () => {
      map.remove();
    };
  }, [safeLon, safeLat]);

  return <div className="h-64 w-full overflow-hidden rounded-2xl border" ref={containerRef} />;
}

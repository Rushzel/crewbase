"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";

export type MapArea = { id: string; name: string; ring: [number, number][]; highlight?: boolean };
export type MapPoint = { lat: number; lng: number; label: string; tone: "good" | "warn" | "bad" };

const COLORS = { good: "#1f9d55", warn: "#b25e00", bad: "#d70015" };

// Read-only map of areas (polygons) and optional points, such as today's accepted time-in locations.
export function AreaMap({ areas, points = [], height = "h-80" }: { areas: MapArea[]; points?: MapPoint[]; height?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(m);
      const brand = getComputedStyle(el.current).getPropertyValue("--brand").trim() || "#0a84ff";
      const bounds = L.latLngBounds([]);
      for (const a of areas) {
        if (a.ring.length < 3) continue;
        const shape = L.polygon(a.ring, { color: brand, weight: a.highlight ? 3 : 2, fillOpacity: a.highlight ? 0.2 : 0.08 })
          .bindTooltip(a.name, { sticky: true })
          .addTo(m);
        bounds.extend(shape.getBounds());
      }
      for (const p of points) {
        L.circleMarker([p.lat, p.lng], { radius: 6, color: "#fff", weight: 2, fillColor: COLORS[p.tone], fillOpacity: 1 })
          .bindTooltip(p.label)
          .addTo(m);
        bounds.extend([p.lat, p.lng]);
      }
      if (bounds.isValid()) m.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
      else m.setView([14.5995, 120.9842], 11);
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [areas, points]);

  return <div ref={el} className={`${height} w-full overflow-hidden rounded-2xl border border-line`} role="img" aria-label="Map of areas" />;
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { saveGeofence, clearGeofences } from "@/app/(app)/settings/setup-actions";

type Fence = { kind: string; radius_m: number | null; center: [number, number] | null; ring: [number, number][] };

// Draw a site's geofence: click once for a circle (then set the radius), or click points for a polygon.
export function GeofenceEditor({ siteId, fences, start }: { siteId: string; fences: Fence[]; start: [number, number] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const draft = useRef<LayerGroup | null>(null);
  const [mode, setMode] = useState<"circle" | "polygon">("circle");
  const [points, setPoints] = useState<[number, number][]>([]);
  const [radius, setRadius] = useState(80);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current).setView(start, 17);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(m);
      for (const f of fences) {
        L.polygon(f.ring, { color: "#1f9d55", weight: 2, fillOpacity: 0.15 }).addTo(m);
      }
      draft.current = L.layerGroup().addTo(m);
      m.on("click", (e) => setPoints((p) => [...p, [e.latlng.lat, e.latlng.lng]]));
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [fences, start]);

  // Redraw the shape being drawn.
  useEffect(() => {
    (async () => {
      const L = (await import("leaflet")).default;
      const g = draft.current;
      if (!g) return;
      g.clearLayers();
      if (mode === "circle" && points.length) L.circle(points[points.length - 1], { radius, color: "var(--brand)" }).addTo(g);
      if (mode === "polygon" && points.length) L.polygon(points, { color: "var(--brand)" }).addTo(g);
    })();
  }, [points, radius, mode]);

  const save = () =>
    startTransition(async () => {
      const shape =
        mode === "circle"
          ? { kind: "circle" as const, lat: points[points.length - 1][0], lng: points[points.length - 1][1], radius }
          : { kind: "polygon" as const, points };
      const r = await saveGeofence(siteId, shape);
      setMessage(r?.error ?? r?.ok ?? null);
      if (!r?.error) setPoints([]);
    });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <button className={mode === "circle" ? "btn-primary" : "btn-quiet"} onClick={() => { setMode("circle"); setPoints([]); }}>Circle</button>
        <button className={mode === "polygon" ? "btn-primary" : "btn-quiet"} onClick={() => { setMode("polygon"); setPoints([]); }}>Polygon</button>
        {mode === "circle" && (
          <label className="flex items-center gap-2">Radius
            <input type="range" min={10} max={500} step={5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
            <span className="w-14 tabular-nums">{radius} m</span>
          </label>
        )}
        <span className="text-muted">{mode === "circle" ? "Click the centre." : `Click the corners (${points.length} so far).`}</span>
      </div>
      <div ref={el} className="h-80 w-full overflow-hidden rounded-2xl border border-line" />
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending || (mode === "circle" ? points.length === 0 : points.length < 3)} onClick={save}>Save geofence</button>
        <button className="btn-quiet" onClick={() => setPoints([])}>Clear drawing</button>
        {fences.length > 0 && (
          <button className="btn-danger" disabled={pending} onClick={() => startTransition(async () => setMessage((await clearGeofences(siteId))?.ok ?? null))}>
            Remove saved geofences
          </button>
        )}
      </div>
      {message && <p className="mt-2 text-sm text-muted" role="status">{message}</p>}
    </div>
  );
}

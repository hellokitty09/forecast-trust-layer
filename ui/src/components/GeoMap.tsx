// Geographic view. Only rendered when Survey-of-India-compliant boundaries are
// present at /boundaries/imd_subdivisions.geojson (hard rule 9, OPEN_QUESTIONS #5).
// Each feature must carry `properties.region_id` matching lib/regions.ts.
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { MapSnapshot } from "../lib/schema";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#999";
}

function colorFor(snapshot: MapSnapshot | null, id: string): string {
  const m = snapshot?.regions[id];
  if (!m) return cssVar("--c-unavail");
  if (m.status === "OK" && m.confidence) return cssVar(`--c-${m.confidence.toLowerCase()}`);
  if (m.status === "NO_SKILL") return cssVar("--c-noskill");
  if (m.status === "OBS_UNCERTAIN") return cssVar("--c-obs");
  return cssVar("--c-unavail");
}

export function GeoMap({
  boundaries,
  snapshot,
  selected,
  onSelect,
}: {
  boundaries: FeatureCollection;
  snapshot: MapSnapshot | null;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": cssVar("--surface-2") } }] },
      bounds: [[65, 5], [100, 38]],
      attributionControl: false,
    });
    m.on("load", () => {
      m.addSource("regions", { type: "geojson", data: boundaries, promoteId: "region_id" });
      m.addLayer({ id: "fill", type: "fill", source: "regions", paint: { "fill-color": ["coalesce", ["feature-state", "color"], cssVar("--c-unavail")], "fill-opacity": 0.9 } });
      m.addLayer({
        id: "line", type: "line", source: "regions",
        paint: { "line-color": cssVar("--surface"), "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 0.8] },
      });
      m.on("click", "fill", (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.region_id;
        if (typeof id === "string") onSelectRef.current(id);
      });
      m.on("mouseenter", "fill", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "fill", () => (m.getCanvas().style.cursor = ""));
    });
    map.current = m;
    return () => m.remove();
  }, [boundaries]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      for (const f of boundaries.features) {
        const id = f.properties?.region_id;
        if (typeof id !== "string") continue;
        m.setFeatureState({ source: "regions", id }, { color: colorFor(snapshot, id), selected: id === selected });
      }
    };
    if (m.isStyleLoaded() && m.getSource("regions")) apply();
    else m.once("load", apply);
  }, [boundaries, snapshot, selected]);

  return <div ref={el} className="geo-map" />;
}

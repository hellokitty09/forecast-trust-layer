// Interactive choropleth using official IMD meteorological subdivision
// boundaries. Forecast values remain supplied by the selected API dataset.
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { MapSnapshot } from "../lib/schema";
import { REGION_BY_ID } from "../lib/regions";
import { STATUS_LABEL } from "../lib/display";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#999";
}

function colorFor(snapshot: MapSnapshot | null, id: string, overrides?: Record<string, string>): string {
  if (overrides && Object.hasOwn(overrides, id)) return overrides[id]!;
  const region = snapshot?.regions[id];
  if (!region) return cssVar("--c-unavail");
  if (region.status === "OK" && region.confidence) return cssVar(`--c-${region.confidence.toLowerCase()}`);
  if (region.status === "NO_SKILL") return cssVar("--c-noskill");
  if (region.status === "OBS_UNCERTAIN") return cssVar("--c-obs");
  return cssVar("--c-unavail");
}

function describe(snapshot: MapSnapshot | null, id: string, overrides?: Record<string, string>): string {
  if (overrides && Object.hasOwn(overrides, id)) return overrides[id]!;
  const region = snapshot?.regions[id];
  if (!region) return "No forecast status available";
  return region.status === "OK" && region.confidence
    ? region.bust_prob == null
      ? `${region.confidence} confidence · bust probability unavailable`
      : `${region.confidence} confidence · ${Math.round(region.bust_prob * 100)}% bust probability`
    : STATUS_LABEL[region.status];
}

function makePattern(color: [number, number, number], dotted: boolean) {
  const width = 8;
  const height = 8;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const visible = dotted ? (x === 2 || x === 6) && (y === 2 || y === 6) : (x + y) % 6 === 0;
      if (!visible) continue;
      const index = (y * width + x) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 220;
    }
  }
  return { width, height, data };
}

export function GeoMap({
  boundaries,
  snapshot,
  colorOverrides,
  detailOverrides,
  selected,
  onSelect,
  ariaLabel = "Interactive map of India's 36 meteorological subdivisions",
}: {
  boundaries: FeatureCollection;
  snapshot: MapSnapshot | null;
  colorOverrides?: Record<string, string>;
  detailOverrides?: Record<string, string>;
  selected: string | null;
  onSelect: (id: string) => void;
  ariaLabel?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const snapshotRef = useRef(snapshot);
  const detailRef = useRef(detailOverrides);
  onSelectRef.current = onSelect;
  snapshotRef.current = snapshot;
  detailRef.current = detailOverrides;

  useEffect(() => {
    if (!el.current) return;
    // Vite optimizes MapLibre into a dependency chunk, which changes the
    // relative worker URL. Point it at Vite's emitted worker asset explicitly.
    maplibregl.setWorkerUrl(maplibreWorkerUrl);
    const m = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": cssVar("--surface-2") } }],
      },
      center: [82.5, 22.5],
      zoom: 3.2,
      minZoom: 2.4,
      maxZoom: 7,
      attributionControl: false,
      cooperativeGestures: true,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "region-popup" });

    m.on("load", () => {
      m.addSource("regions", { type: "geojson", data: boundaries, promoteId: "region_id" });
      m.addImage("no-skill-hatch", makePattern([69, 84, 94], false));
      m.addImage("obs-uncertain-dots", makePattern([78, 54, 125], true));
      m.addLayer({
        id: "region-fill",
        type: "fill",
        source: "regions",
        paint: {
          "fill-color": ["coalesce", ["feature-state", "color"], cssVar("--c-unavail")],
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, 0.88],
        },
      });
      m.addLayer({
        id: "no-skill-pattern",
        type: "fill",
        source: "regions",
        paint: {
          "fill-pattern": "no-skill-hatch",
          "fill-opacity": ["case", ["boolean", ["feature-state", "noSkill"], false], 0.84, 0],
        },
      });
      m.addLayer({
        id: "obs-uncertain-pattern",
        type: "fill",
        source: "regions",
        paint: {
          "fill-pattern": "obs-uncertain-dots",
          "fill-opacity": ["case", ["boolean", ["feature-state", "obsUncertain"], false], 0.9, 0],
        },
      });
      m.addLayer({
        id: "region-borders",
        type: "line",
        source: "regions",
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], cssVar("--accent"), "#ffffff"],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.7, 1.05],
          "line-opacity": 0.98,
        },
      });
      m.fitBounds([[67.5, 6.5], [97.5, 37.5]], { padding: { top: 30, right: 30, bottom: 30, left: 30 }, duration: 0 });

      m.on("click", "region-fill", (event: maplibregl.MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.region_id;
        if (typeof id === "string") onSelectRef.current(id);
      });
      m.on("mousemove", "region-fill", (event: maplibregl.MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.region_id;
        if (typeof id !== "string" || !event.lngLat) return;
        const content = document.createElement("div");
        content.className = "region-popup-content";
        const title = document.createElement("strong");
        title.textContent = REGION_BY_ID[id]?.name ?? id;
        const status = document.createElement("span");
        status.textContent = describe(snapshotRef.current, id, detailRef.current);
        content.append(title, status);
        hover.setLngLat(event.lngLat).setDOMContent(content).addTo(m);
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", "region-fill", () => {
        hover.remove();
        m.getCanvas().style.cursor = "";
      });
    });
    map.current = m;

    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);

    return () => {
      ro.disconnect();
      hover.remove();
      m.remove();
      map.current = null;
    };
  }, [boundaries]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      for (const feature of boundaries.features) {
        const id = feature.properties?.region_id;
        if (typeof id !== "string") continue;
        const region = snapshot?.regions[id];
        m.setFeatureState({ source: "regions", id }, {
          color: colorFor(snapshot, id, colorOverrides),
          selected: id === selected,
          noSkill: !colorOverrides && region?.status === "NO_SKILL",
          obsUncertain: !colorOverrides && region?.status === "OBS_UNCERTAIN",
        });
      }
    };
    if (m.isStyleLoaded() && m.getSource("regions")) apply();
    else m.once("load", apply);
  }, [boundaries, snapshot, colorOverrides, selected]);

  return <div ref={el} className="geo-map" role="application" aria-label={ariaLabel} />;
}

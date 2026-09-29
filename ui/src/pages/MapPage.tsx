import { lazy, Suspense, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { FeatureCollection } from "geojson";
import { getMap } from "../api/client";
import { InitPicker, LeadSlider, VariablePicker } from "../components/Controls";
import { MapLegend, TileMap } from "../components/TileMap";
import { TrustCardPanel } from "../components/TrustCardPanel";
import { fmtInit, STATUS_LABEL } from "../lib/display";
import type { MapSnapshot } from "../lib/schema";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { BOUNDARY_URL } from "../lib/regions";

const GeoMap = lazy(() => import("../components/GeoMap").then((m) => ({ default: m.GeoMap })));

async function loadBoundaries(): Promise<FeatureCollection | null> {
  try {
    const res = await fetch(BOUNDARY_URL);
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    const j = (await res.json()) as FeatureCollection;
    return j?.type === "FeatureCollection" && Array.isArray(j.features) ? j : null;
  } catch {
    return null;
  }
}

async function loadSnapshot(init: string, lead: number, variable: MapSnapshot["variable"]): Promise<MapSnapshot> {
  return getMap(init, lead, variable);
}

export function MapPage() {
  const { init, setInit, lead, setLead, variable, setVariable } = useApp();
  // Start on the example region so the preview opens with a usable Trust Card.
  const [selected, setSelected] = useState<string | null>("IMD_SUB_TELANGANA");
  const [view, setView] = useState<"schematic" | "geo">("geo");
  const mapLayout = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const panel = mapLayout.current?.querySelector(".map-wrap");
    if (panel) gsap.fromTo(panel, { opacity: 0.78, y: 5 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" });
  }, { dependencies: [init, lead, variable], revertOnUpdate: true });
  const { token } = useApp();
  const snap = useAsync(() => loadSnapshot(init, lead, variable), [init, lead, variable, token]);
  const boundaries = useAsync(loadBoundaries, []);
  const geo = boundaries.kind === "ok" ? boundaries.value : null;

  return (
    <div className="page map-page">
      <div className="page-head map-page-head">
        <div>
          <h1>National confidence map</h1>
          <p>See where forecast confidence changes across India. Select a meteorological subdivision to inspect its Trust Card.</p>
        </div>
        <div className="controls">
          <InitPicker value={init} onChange={setInit} />
        </div>
      </div>

      <div className="card map-control-deck" style={{ marginBottom: 16 }}>
        <div className="controls" style={{ justifyContent: "space-between" }}>
          <VariablePicker value={variable} onChange={setVariable} />
          <LeadSlider value={lead} onChange={setLead} />
          <div className="field">
            <span>Map view</span>
            <div className="seg">
              <button type="button" className="map-view-button" aria-pressed={view === "geo"} onClick={() => setView("geo")}>India map</button>
              <button type="button" className="map-view-button" aria-pressed={view === "schematic"} onClick={() => setView("schematic")}>Region tiles</button>
            </div>
          </div>
        </div>
      </div>

      <div className="map-layout" ref={mapLayout}>
        <div className="card map-wrap">
          {snap.kind === "ok" && (
            <div className="map-meta">
              <span>
                init {fmtInit(snap.value.init_time)} · Day {snap.value.lead_day}
              </span>
              <Summary snap={snap.value} />
            </div>
          )}
          {snap.kind === "loading" && <div className="empty muted">Loading map...</div>}
          {snap.kind === "error" && (
            <div className="empty muted">Could not load forecast data. Please try again.</div>
          )}
          {snap.kind === "ok" && (
            <>
              <div style={{ position: "relative" }}>
                {view === "geo" && geo ? (
                  <Suspense fallback={<div className="empty muted">Loading map engine...</div>}>
                    <GeoMap boundaries={geo} snapshot={snap.value} selected={selected} onSelect={setSelected} />
                  </Suspense>
                ) : view === "geo" ? (
                  <div className="map-unavailable" role="status">
                    <strong>Subdivision map is unavailable</strong>
                    <span>The official IMD boundary file could not be loaded. The geographic view will not substitute a guessed outline.</span>
                    <button type="button" className="btn" onClick={() => setView("schematic")}>Open region tiles</button>
                  </div>
                ) : (
                  <TileMap snapshot={snap.value} selected={selected} onSelect={setSelected} />
                )}
              </div>
              {view === "geo" && geo && <div className="map-source"><span className="source-dot" /> IMD meteorological subdivisions <span>·</span> 36 regions <span>·</span> select an area for details</div>}
              <MapLegend />
            </>
          )}
        </div>
        <TrustCardPanel regionId={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}

function Summary({ snap }: { snap: MapSnapshot }) {
  const counts: Record<string, number> = {};
  for (const r of Object.values(snap.regions)) {
    const k = r.status === "OK" && r.confidence ? r.confidence : STATUS_LABEL[r.status];
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return (
    <span className="map-counts" aria-label="Region counts by confidence">
      {Object.entries(counts).map(([label, count]) => (
        <span className="map-count" key={label}>
          <i className={`map-count-dot ${confidenceClass(label)}`} aria-hidden="true" />
          <b className="num">{count}</b> {label}
        </span>
      ))}
    </span>
  );
}

function confidenceClass(label: string): string {
  if (label === "HIGH") return "high";
  if (label === "MEDIUM") return "medium";
  if (label === "LOW") return "low";
  return "other";
}

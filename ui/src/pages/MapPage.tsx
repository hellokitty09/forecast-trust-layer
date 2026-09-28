import { lazy, Suspense, useState } from "react";
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
import { India3DMap } from "../components/India3DMap";

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
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"schematic" | "geo" | "3d">("schematic");
  const { token } = useApp();
  const snap = useAsync(() => loadSnapshot(init, lead, variable), [init, lead, variable, token]);
  const boundaries = useAsync(loadBoundaries, []);
  const geo = boundaries.kind === "ok" ? boundaries.value : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>National confidence map</h1>
          <p>How much to trust today's forecast, region by region, for each lead day. Click a region for its Trust Card.</p>
        </div>
        <div className="controls">
          <InitPicker value={init} onChange={setInit} />
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="controls" style={{ justifyContent: "space-between" }}>
          <VariablePicker value={variable} onChange={setVariable} />
          <LeadSlider value={lead} onChange={setLead} />
          <div className="field">
            <span>View</span>
            <div className="seg">
              <button aria-pressed={view === "schematic"} onClick={() => setView("schematic")}>Schematic</button>
              {geo && <button aria-pressed={view === "geo"} onClick={() => setView("geo")}>Geographic</button>}
              <button aria-pressed={view === "3d"} onClick={() => setView("3d")}>3D India</button>
            </div>
          </div>
        </div>
      </div>

      <div className="map-layout">
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
                {view === "3d" ? (
                  <India3DMap snapshot={snap.value} selected={selected} onSelect={setSelected} />
                ) : view === "geo" && geo ? (
                  <Suspense fallback={<div className="empty muted">Loading map engine...</div>}>
                    <GeoMap boundaries={geo} snapshot={snap.value} selected={selected} onSelect={setSelected} />
                  </Suspense>
                ) : (
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, opacity: 0.15, pointerEvents: "none", display: "flex", justifyContent: "center", alignItems: "center" }}>
                      <India3DMap width={400} height={480} />
                    </div>
                    <TileMap snapshot={snap.value} selected={selected} onSelect={setSelected} />
                  </div>
                )}
              </div>
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
    const k = r.status === "OK" ? r.confidence ?? "UNAVAILABLE" : STATUS_LABEL[r.status];
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return (
    <span className="num">
      {Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(" · ")}
    </span>
  );
}

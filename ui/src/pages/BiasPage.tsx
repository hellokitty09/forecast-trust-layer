import { lazy, Suspense, useMemo, useState } from "react";
import type { FeatureCollection } from "geojson";
import { getBias, getBiasGrid } from "../api/client";
import { GridSection } from "../components/GridBias";
import { EChart, cssVar, themedBase } from "../components/EChart";
import { EmptyState } from "../components/EmptyState";
import { LeadSlider, VariablePicker } from "../components/Controls";
import { REGIONS, regionName, BOUNDARY_URL } from "../lib/regions";
import { SEASONS, SEASON_LABEL, type BiasMap, type SkillHorizon } from "../lib/reports";
import type { Variable } from "../lib/schema";
import { useApp } from "../lib/state";
import { useAsync, type Async } from "../lib/useAsync";

const GeoMap = lazy(() => import("../components/GeoMap").then((m) => ({ default: m.GeoMap })));

type Season = (typeof SEASONS)[number];

function part<R, T>(res: Async<R>, get: (r: R) => T | null): Async<T> {
  if (res.kind !== "ok") return res;
  const v = get(res.value);
  return v ? { kind: "ok", value: v } : { kind: "error", msg: "not generated", status: 404 };
}

function accessMessage(a: Async<unknown>): string | null {
  if (a.kind !== "error") return null;
  if (a.status === 401) return "Sign in as a scientist or forecaster to see error-prone areas.";
  if (a.status === 403) return "Your role can't view model-developer reports.";
  return `Could not load this report (${a.msg}). Nothing is shown rather than a partial map.`;
}

function hexMix(from: string, to: string, amount: number): string {
  const a = from.match(/[0-9a-f]{2}/gi)!.map((x) => parseInt(x, 16));
  const b = to.match(/[0-9a-f]{2}/gi)!.map((x) => parseInt(x, 16));
  return `#${a.map((value, i) => Math.round(value + (b[i]! - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function divergingFill(v: number | null | undefined, maxAbs: number): string {
  if (v == null) return "#e4eaee";
  const amount = Math.max(0, Math.min(1, Math.abs(v) / (maxAbs || 1)));
  return v >= 0 ? hexMix("#f4f7f8", "#bd3c3c", amount) : hexMix("#f4f7f8", "#2768a7", amount);
}

async function loadBoundaries(): Promise<FeatureCollection | null> {
  try {
    const response = await fetch(BOUNDARY_URL);
    if (!response.ok) return null;
    const data = (await response.json()) as FeatureCollection;
    return data.type === "FeatureCollection" && Array.isArray(data.features) ? data : null;
  } catch {
    return null;
  }
}

export function BiasPage() {
  const { token } = useApp();
  const [variable, setVariable] = useState<Variable>("rain");
  const [season, setSeason] = useState<Season>("monsoon");
  const res = useAsync(() => getBias(variable, season), [variable, season, token]);
  const grid = useAsync(() => getBiasGrid(variable, season), [variable, season, token]);
  const [lead, setLead] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const boundariesResult = useAsync(loadBoundaries, []);
  const blocked = accessMessage(res);
  const bias = part(res, (r) => r.bias);
  const skill = part(res, (r) => r.skill_horizon);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Error-prone areas &amp; skill horizon</h1>
          <p>
            For model developers: where the model is systematically wrong (training folds only), and the last lead
            day at which the forecast beats climatology with a bootstrap lower bound above zero.
          </p>
        </div>
        <span className="tag">SCIENTIST · FORECASTER</span>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="controls">
          <VariablePicker value={variable} onChange={setVariable} />
          <div className="field">
            <span>Season</span>
            <div className="seg" role="group" aria-label="Season">
              {SEASONS.map((s) => (
                <button key={s} aria-pressed={s === season} onClick={() => setSeason(s)}>{SEASON_LABEL[s]}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {blocked && (
        <div className="card" style={{ marginBottom: 16 }}>
          <EmptyState title="Not available">{blocked}</EmptyState>
        </div>
      )}

      {grid.kind === "ok" && <GridSection g={grid.value} />}

      {grid.kind === "ok" && bias.kind === "error" && bias.status === 404 && skill.kind === "error" && skill.status === 404 ? (
        <p className="notice">No verified bias or skill-horizon report is available for this selection.</p>
      ) : (
      <div className="bias-panels">
        <section className="card card-pad">
          <div className="tc-row" style={{ marginBottom: 8 }}>
            <div>
              <h2>Where the forecast runs high or low</h2>
              <p className="muted" style={{ margin: "4px 0 0" }}>Mean forecast minus observed value. Blue means under-forecast; red means over-forecast.</p>
            </div>
          </div>
          {bias.kind === "loading" && <div className="empty muted">Loading…</div>}
          {bias.kind === "error" && bias.status === 404 && (
            <EmptyState title="Bias map not generated yet" command="make data-mvp && make eval">
              Built from forecasts verified against IMD observations.
            </EmptyState>
          )}
          {bias.kind === "ok" && boundariesResult.kind === "ok" && boundariesResult.value && (
            <Suspense fallback={<div className="empty muted">Loading India map…</div>}>
              <BiasGeoMap b={bias.value} lead={lead} setLead={setLead} sel={sel} setSel={setSel} boundaries={boundariesResult.value} />
            </Suspense>
          )}
          {bias.kind === "ok" && boundariesResult.kind === "loading" && <div className="empty muted">Loading official subdivision boundaries…</div>}
          {bias.kind === "ok" && boundariesResult.kind === "ok" && !boundariesResult.value && (
            <EmptyState title="India map unavailable">The subdivision boundary file could not be loaded.</EmptyState>
          )}
        </section>

        <section className="card card-pad">
          <div className="tc-row" style={{ marginBottom: 8 }}>
            <div>
              <h2>How far the forecast remains useful</h2>
              <p className="muted" style={{ margin: "4px 0 0" }}>Skill is compared with climatology across Day 1–10. A region selection narrows this chart.</p>
            </div>
          </div>
          {skill.kind === "loading" && <div className="empty muted">Loading…</div>}
          {skill.kind === "error" && skill.status === 404 && (
            <EmptyState title="Skill-horizon results not generated yet" command="make data-mvp && make eval">
              Skill vs climatology (SEEPS skill / BSS) per region × lead with a bootstrap lower bound.
            </EmptyState>
          )}
          {skill.kind === "ok" && <SkillChart s={skill.value} region={sel} />}
        </section>
      </div>
      )}
    </div>
  );
}

function BiasGeoMap({ b, lead, setLead, sel, setSel, boundaries }: { b: BiasMap; lead: number; setLead: (n: number) => void; sel: string | null; setSel: (s: string) => void; boundaries: FeatureCollection }) {
  const li = b.lead_days.indexOf(lead);
  const maxAbs = useMemo(
    () => Math.max(0, ...Object.values(b.regions).flat().filter((v): v is number => v != null).map(Math.abs)),
    [b],
  );
  const colors = useMemo(() => Object.fromEntries(REGIONS.map(({ id }) => {
    const value = li >= 0 ? b.regions[id]?.[li] : undefined;
    return [id, divergingFill(value, maxAbs)];
  })), [b, li, maxAbs]);
  const details = useMemo(() => Object.fromEntries(REGIONS.map(({ id, name }) => {
    const value = li >= 0 ? b.regions[id]?.[li] : undefined;
    return [id, value == null ? `${name} · no bias estimate` : `${name} · ${value > 0 ? "over-forecast" : value < 0 ? "under-forecast" : "no mean bias"} · ${value > 0 ? "+" : ""}${value.toFixed(1)} ${b.unit}`];
  })), [b, li]);
  return (
    <>
      <div className="faint" style={{ marginBottom: 8 }}>Forecast: {b.source} · Truth: {b.truth} · {b.variable} · {b.season} · generated {b.generated_at}</div>
      <LeadSlider value={lead} onChange={setLead} />
      <GeoMap boundaries={boundaries} snapshot={null} colorOverrides={colors} detailOverrides={details} selected={sel} onSelect={setSel} ariaLabel="Mean forecast bias across India's 36 meteorological subdivisions" />
      <div className="bias-gradient" aria-label={`Bias scale from under-forecast ${maxAbs.toFixed(1)} ${b.unit} to over-forecast ${maxAbs.toFixed(1)} ${b.unit}`}>
        <div className="bias-gradient-bar" />
        <div className="bias-gradient-labels"><span>−{maxAbs.toFixed(1)} {b.unit}<small>Under-forecast</small></span><span>0<small>Near zero</small></span><span>+{maxAbs.toFixed(1)} {b.unit}<small>Over-forecast</small></span></div>
      </div>
      <div className="legend"><span className="legend-item"><span className="swatch" style={{ background: "var(--c-unavail)" }} /> No data</span></div>
      <div className="map-source"><span className="source-dot" /> IMD meteorological subdivisions <span>·</span> click a region to focus the skill chart</div>
    </>
  );
}

function SkillChart({ s, region }: { s: SkillHorizon; region: string | null }) {
  const rows = Object.entries(s.regions).map(([id, value]) => ({ id, ...value })).sort((a, b) => {
    if (a.horizon_day == null) return b.horizon_day == null ? regionName(a.id).localeCompare(regionName(b.id)) : 1;
    if (b.horizon_day == null) return -1;
    return b.horizon_day - a.horizon_day;
  });
  const ids = region && s.regions[region] ? [region] : rows.map((r) => r.id);
  const option = useMemo(() => {
    const base = themedBase() as Record<string, unknown>;
    const mono = ids.length === 1;
    const accent = cssVar("--accent");
    if (!mono) {
      return {
        ...base,
        grid: { left: 190, right: 54, top: 18, bottom: 34 },
        legend: { show: false },
        xAxis: { type: "value", min: 0, max: 10, interval: 1, name: "Last useful lead day", nameLocation: "middle", nameGap: 28 },
        yAxis: { type: "category", inverse: true, data: rows.map((r) => regionName(r.id)), axisLabel: { width: 175, overflow: "truncate" } },
        series: [{
          name: "Skill horizon",
          type: "bar",
          barMaxWidth: 13,
          data: rows.map((r) => ({ value: r.horizon_day ?? 0, itemStyle: { color: r.horizon_day == null ? "#dfe5e8" : accent } })),
          label: { show: true, position: "right", color: cssVar("--ink-2"), formatter: (p: { dataIndex: number }) => rows[p.dataIndex]?.horizon_day == null ? "No useful skill" : `Day ${rows[p.dataIndex]!.horizon_day}` },
        }],
      };
    }
    return {
      ...base,
      legend: { show: false },
      xAxis: { ...(base.xAxis as object), type: "category", name: "Lead day", nameLocation: "middle", nameGap: 28, data: s.lead_days.map(String) },
      yAxis: { ...(base.yAxis as object), type: "value", name: s.metric },
      series: ids.flatMap((id) => {
        const r = s.regions[id]!;
        const line = {
          name: regionName(id),
          type: "line",
          data: r.skill,
          symbolSize: mono ? 7 : 3,
          lineStyle: { width: mono ? 2.5 : 1, opacity: mono ? 1 : 0.35, color: accent },
          itemStyle: { color: accent },
          markLine: mono
            ? { silent: true, symbol: "none", data: [{ yAxis: 0 }], lineStyle: { color: cssVar("--c-low"), type: "solid" }, label: { formatter: "no skill", color: cssVar("--ink-2") } }
            : undefined,
        };
        if (!mono) return [line];
        return [line, { name: "bootstrap lower bound", type: "line", data: r.lower, symbol: "none", lineStyle: { type: "dashed", color: cssVar("--ink-3") } }];
      }),
    };
  }, [s, ids.join(), rows.map((r) => `${r.id}:${r.horizon_day}`).join()]);

  const horizon = region ? s.regions[region]?.horizon_day : null;
  return (
    <>
      <div className="faint" style={{ marginBottom: 8 }}>Forecast: {s.source} · Truth: {s.truth} · {s.variable} · generated {s.generated_at}</div>
      <div className="muted">
        {region
          ? <>Showing <b>{regionName(region)}</b> - skill horizon: <b>{horizon == null ? "no useful skill" : `Day ${horizon}`}</b></>
          : <>Ranked by the last useful forecast lead. Select an area on the bias map to inspect its day-by-day skill curve.</>}
      </div>
      <EChart option={option} height={region ? 340 : 760} />
    </>
  );
}

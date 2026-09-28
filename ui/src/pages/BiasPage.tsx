import { useMemo, useState } from "react";
import { getBias, getBiasGrid } from "../api/client";
import { GridSection } from "../components/GridBias";
import { EChart, cssVar, themedBase } from "../components/EChart";
import { EmptyState } from "../components/EmptyState";
import { RegionTiles } from "../components/TileMap";
import { LeadSlider, VariablePicker } from "../components/Controls";
import { REGIONS, regionName } from "../lib/regions";
import { SEASONS, SEASON_LABEL, type BiasMap, type SkillHorizon } from "../lib/reports";
import type { Variable } from "../lib/schema";
import { useApp } from "../lib/state";
import { useAsync, type Async } from "../lib/useAsync";

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

function divergingFill(v: number | null | undefined, maxAbs: number): string {
  if (v == null) return "var(--c-unavail)";
  const t = Math.max(-1, Math.min(1, v / (maxAbs || 1)));
  const a = Math.round(Math.abs(t) * 100);
  return t >= 0 ? `color-mix(in oklab, var(--c-low) ${a}%, var(--surface-2))` : `color-mix(in oklab, var(--a-bias) ${a}%, var(--surface-2))`;
}

export function BiasPage() {
  const { token } = useApp();
  const [variable, setVariable] = useState<Variable>("rain");
  const [season, setSeason] = useState<Season>("monsoon");
  const res = useAsync(() => getBias(variable, season), [variable, season, token]);
  const grid = useAsync(() => getBiasGrid(variable, season), [variable, season, token]);
  const [lead, setLead] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
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
        <p className="notice">
          Subdivision tiles appear once Survey-of-India-compliant subdivision boundaries are available.
        </p>
      ) : (
      <div className="grid-2">
        <section className="card card-pad">
          <div className="tc-row" style={{ marginBottom: 8 }}>
            <h2>Systematic bias map</h2>
          </div>
          {bias.kind === "loading" && <div className="empty muted">Loading…</div>}
          {bias.kind === "error" && bias.status === 404 && (
            <EmptyState title="Bias map not generated yet" command="make data-mvp && make eval">
              Built from forecasts verified against IMD observations.
            </EmptyState>
          )}
          {bias.kind === "ok" && <BiasTiles b={bias.value} lead={lead} setLead={setLead} sel={sel} setSel={setSel} />}
        </section>

        <section className="card card-pad">
          <div className="tc-row" style={{ marginBottom: 8 }}>
            <h2>Skill horizon</h2>
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

function BiasTiles({ b, lead, setLead, sel, setSel }: { b: BiasMap; lead: number; setLead: (n: number) => void; sel: string | null; setSel: (s: string) => void }) {
  const li = b.lead_days.indexOf(lead);
  const maxAbs = useMemo(
    () => Math.max(0, ...Object.values(b.regions).flat().filter((v): v is number => v != null).map(Math.abs)),
    [b],
  );
  return (
    <>
      <div className="faint" style={{ marginBottom: 8 }}>Forecast: {b.source} · Truth: {b.truth} · {b.variable} · {b.season} · generated {b.generated_at}</div>
      <LeadSlider value={lead} onChange={setLead} />
      <RegionTiles
        ariaLabel="Bias by region"
        selected={sel}
        onSelect={setSel}
        spec={(id) => {
          const v = li >= 0 ? b.regions[id]?.[li] : undefined;
          return {
            fill: divergingFill(v, maxAbs),
            ink: "var(--ink)",
            sub: v == null ? "no data" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
            label: v == null ? "insufficient data" : `bias ${v.toFixed(2)} ${b.unit}`,
          };
        }}
      />
      <div className="legend">
        <span className="legend-item"><span className="swatch" style={{ background: "var(--a-bias)" }} /> Under-forecast (−{maxAbs.toFixed(1)} {b.unit})</span>
        <span className="legend-item"><span className="swatch" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }} /> No bias</span>
        <span className="legend-item"><span className="swatch" style={{ background: "var(--c-low)" }} /> Over-forecast (+{maxAbs.toFixed(1)} {b.unit})</span>
        <span className="legend-item"><span className="swatch" style={{ background: "var(--c-unavail)" }} /> No data</span>
      </div>
    </>
  );
}

function SkillChart({ s, region }: { s: SkillHorizon; region: string | null }) {
  const ids = region && s.regions[region] ? [region] : Object.keys(s.regions);
  const option = useMemo(() => {
    const base = themedBase() as Record<string, unknown>;
    const mono = ids.length === 1;
    const accent = cssVar("--accent");
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
  }, [s, ids.join()]);

  const horizon = region ? s.regions[region]?.horizon_day : null;
  return (
    <>
      <div className="faint" style={{ marginBottom: 8 }}>Forecast: {s.source} · Truth: {s.truth} · {s.variable} · generated {s.generated_at}</div>
      <div className="muted">
        {region
          ? <>Showing <b>{regionName(region)}</b> — skill horizon: <b>{horizon == null ? "no useful skill" : `Day ${horizon}`}</b></>
          : <>All {Object.keys(s.regions).length} regions. Click a tile on the bias map to focus one.</>}
      </div>
      <EChart option={option} height={340} />
      {!region && (
        <table className="tbl">
          <thead><tr><th>Region</th><th className="r">Skill horizon</th></tr></thead>
          <tbody>
            {REGIONS.filter((r) => s.regions[r.id]).map((r) => (
              <tr key={r.id}><td>{r.name}</td><td className="r num">{s.regions[r.id]!.horizon_day == null ? "no skill" : `Day ${s.regions[r.id]!.horizon_day}`}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

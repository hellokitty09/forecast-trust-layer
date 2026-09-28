// M0 grid view: systematic bias, skill horizon and all-India SEEPS skill from /v1/bias/grid.
import { useMemo, useState } from "react";
import { LeadSlider } from "./Controls";
import { EChart, cssVar, themedBase } from "./EChart";
import { GridRaster } from "./GridRaster";
import type { GridReport } from "../lib/reports";

// brown = forecast too dry … green = too wet (colour-blind-safe BrBG endpoints)
const DRY = [140, 81, 10], WET = [1, 102, 94], MID = [245, 245, 245];
function mix(a: number[], b: number[], t: number): string {
  return `rgb(${a.map((x, i) => Math.round(x + (b[i]! - x) * t)).join(",")})`;
}

const HZ = ["#fde725", "#b5de2b", "#6ece58", "#35b779", "#1f9e89", "#26828e", "#31688e", "#3e4989", "#482878", "#440154"];

function percentileAbs(rows: (number | null)[][], p: number): number {
  const v = rows.flat().filter((x): x is number => x != null).map(Math.abs).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))]! : 1;
}

export function GridSection({ g }: { g: GridReport }) {
  const [lead, setLead] = useState(1);
  const [cell, setCell] = useState<number | null>(null);
  const li = g.lead_days.indexOf(lead);
  const lim = useMemo(() => percentileAbs(g.bias, 0.98) || 1, [g]);
  const biasColor = (v: number) => (v < 0 ? mix(MID, DRY, Math.min(1, -v / lim)) : mix(MID, WET, Math.min(1, v / lim)));
  const hzValues = useMemo(() => g.horizon_day.map((h) => h ?? 0), [g]);
  const noSkill = g.horizon_day.filter((h) => h == null).length;
  const yrs = `${g.eval_years[0]}–${g.eval_years[g.eval_years.length - 1]}`;

  return (
    <>
      <div className="faint" style={{ marginBottom: 10 }}>
        Forecast: {g.source} · Truth: <b>{g.truth}</b> · {yrs}, {g.season} ({g.n_inits} runs) ·
        generated {g.generated_at.slice(0, 16).replace("T", " ")} UTC
      </div>
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <section className="card card-pad" style={{ display: "grid", gap: 8 }}>
          <h2>Systematic bias · Day {lead}</h2>
          <LeadSlider value={lead} onChange={setLead} />
          {li >= 0 && (
            <GridRaster
              lat={g.cells.lat}
              lon={g.cells.lon}
              values={g.bias[li]!}
              color={biasColor}
              format={(v) => (v == null ? "too few samples" : `${v > 0 ? "+" : ""}${v.toFixed(1)} ${g.unit}`)}
              label={`Rain bias Day ${lead}`}
              selected={cell}
              onSelect={setCell}
            />
          )}
          <div className="gradient-legend" style={{ background: `linear-gradient(90deg, ${mix(MID, DRY, 1)}, ${mix(MID, MID, 0)}, ${mix(MID, WET, 1)})` }} />
          <div className="gradient-labels">
            <span>−{lim.toFixed(1)} {g.unit} · forecast too dry</span><span>0</span><span>too wet · +{lim.toFixed(1)} {g.unit}</span>
          </div>
        </section>

        <section className="card card-pad" style={{ display: "grid", gap: 8 }}>
          <h2>Skill horizon — last useful lead day</h2>
          <p className="muted" style={{ margin: 0 }}>
            Last lead day at which SEEPS skill's {Math.round(g.ci * 100)}% lower bound stays above zero on every day
            up to it. {noSkill > 0 && <>{noSkill} cells have no useful skill even on Day 1.</>}
          </p>
          <GridRaster
            lat={g.cells.lat}
            lon={g.cells.lon}
            values={hzValues}
            color={(v) => (v <= 0 ? cssVar("--c-noskill") : HZ[Math.min(9, v - 1)]!)}
            format={(v) => (v == null || v <= 0 ? "no useful skill" : `useful to Day ${v}`)}
            label="Skill horizon"
            selected={cell}
            onSelect={setCell}
          />
          <div className="legend">
            <span className="legend-item"><span className="swatch" style={{ background: cssVar("--c-noskill") }} /> no skill</span>
            {HZ.map((c, i) => (
              <span className="legend-item" key={c}><span className="swatch" style={{ background: c }} />{i + 1}</span>
            ))}
          </div>
        </section>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <section className="card card-pad">
          <h2>All-India SEEPS skill by lead day</h2>
          <SkillCurve
            leads={g.all_india.lead_days} skill={g.all_india.skill} lower={g.all_india.lower} upper={g.all_india.upper}
            horizon={g.all_india.horizon_day} ci={g.ci}
          />
        </section>
        <section className="card card-pad">
          <h2>Selected cell</h2>
          {cell == null ? (
            <p className="muted">Click a cell on either map to see its skill by lead day.</p>
          ) : (
            <>
              <div className="muted">
                {g.cells.lat[cell]!.toFixed(2)}°N {g.cells.lon[cell]!.toFixed(2)}°E · horizon{" "}
                <b>{g.horizon_day[cell] == null ? "no useful skill" : `Day ${g.horizon_day[cell]}`}</b> · {g.n[0]![cell]} runs
              </div>
              <SkillCurve
                leads={g.lead_days} skill={g.skill.map((r) => r[cell] ?? null)} lower={g.skill_lower.map((r) => r[cell] ?? null)}
                upper={g.skill_upper.map((r) => r[cell] ?? null)} horizon={g.horizon_day[cell] ?? null} ci={g.ci}
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}

function SkillCurve(p: { leads: number[]; skill: (number | null)[]; lower: (number | null)[]; upper: (number | null)[]; horizon: number | null; ci: number }) {
  const option = useMemo(() => {
    const base = themedBase() as Record<string, unknown>;
    const accent = cssVar("--accent");
    return {
      ...base,
      legend: { show: false },
      xAxis: { ...(base.xAxis as object), type: "category", data: p.leads.map(String), name: "Lead day", nameLocation: "middle", nameGap: 28 },
      yAxis: { ...(base.yAxis as object), type: "value", name: "1 − SEEPS" },
      series: [
        // CI band = transparent lower + stacked (upper − lower)
        { name: "lower", type: "line", data: p.lower, stack: "ci", stackStrategy: "all", symbol: "none", lineStyle: { opacity: 0 }, silent: true },
        {
          name: `${Math.round(p.ci * 100)}% CI`, type: "line", stack: "ci", stackStrategy: "all", symbol: "none", lineStyle: { opacity: 0 },
          areaStyle: { color: accent, opacity: 0.18 }, silent: true,
          data: p.upper.map((u, i) => (u == null || p.lower[i] == null ? null : u - p.lower[i]!)),
        },
        {
          name: "skill", type: "line", data: p.skill, symbolSize: 6, lineStyle: { color: accent, width: 2.5 }, itemStyle: { color: accent },
          markLine: {
            silent: true, symbol: "none",
            data: [
              { yAxis: 0, lineStyle: { color: cssVar("--c-low"), type: "solid" }, label: { formatter: "no skill", color: cssVar("--ink-2") } },
              ...(p.horizon ? [{ xAxis: String(p.horizon), lineStyle: { color: cssVar("--ink-3"), type: "dashed" }, label: { formatter: `horizon Day ${p.horizon}`, color: cssVar("--ink-2") } }] : []),
            ],
          },
        },
      ],
    };
  }, [p.leads, p.skill, p.lower, p.upper, p.horizon, p.ci]);
  return <EChart option={option} height={300} />;
}

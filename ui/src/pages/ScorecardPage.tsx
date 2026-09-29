import { useMemo, useState } from "react";
import { getScorecard } from "../api/client";
import { EChart, cssVar, themedBase } from "../components/EChart";
import { EmptyState } from "../components/EmptyState";
import type { Scorecard } from "../lib/reports";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";

const f = (x: number | null | undefined, d = 3) => (x == null ? "-" : x.toFixed(d));
const ci = (c: [number, number] | null | undefined) => (c ? `[${c[0].toFixed(3)}, ${c[1].toFixed(3)}]` : "Not available");
const VARIABLE_NAME: Record<string, string> = { rain: "Rainfall", tmax: "Maximum temperature", wind850: "850 hPa wind" };
const MODEL_META: Record<string, { label: string; detail: string; kind: string }> = {
  FTL: { label: "Trust layer", detail: "Combined forecast-risk estimate", kind: "proposed" },
  "ensemble spread (calibrated)": { label: "Ensemble spread", detail: "Calibrated ensemble baseline · comparison bar", kind: "baseline" },
  climatology: { label: "Climatology", detail: "Historical-frequency reference", kind: "reference" },
};

export function ScorecardPage() {
  const { token } = useApp();
  const sc = useAsync(getScorecard, [token]);
  return (
    <div className="page scorecard-page">
      <div className="score-intro">
        <div>
          <span className="eyebrow">MODEL DEVELOPER VIEW <span>·</span> VERIFICATION</span>
          <h1>Does the trust layer add useful skill?</h1>
          <p>Compare the proposed trust layer with its operational baseline, by variable and forecast range. A forecaster should be able to see what improves-and where uncertainty remains.</p>
        </div>
        <div className="score-intro-stamp"><span className="stamp-dot" /> Evaluation workspace</div>
      </div>

      {sc.kind === "loading" && <div className="card empty muted">Loading comparison…</div>}
      {sc.kind === "error" && (
        <div className="card">
          <EmptyState title="Verification report is unavailable">
            {sc.msg}. Nothing is shown rather than a partial or guessed scorecard.
          </EmptyState>
        </div>
      )}
      {sc.kind === "ok" && <ScorecardBody sc={sc.value} />}
    </div>
  );
}

function ScorecardBody({ sc }: { sc: Scorecard }) {
  const variables = useMemo(() => [...new Set(sc.rows.map((r) => r.variable))], [sc.rows]);
  const bands = useMemo(() => [...new Set(sc.rows.map((r) => r.lead_band))], [sc.rows]);
  const [variable, setVariable] = useState(variables[0] ?? "rain");
  const [band, setBand] = useState(bands[0] ?? "Day 1-3");
  const rows = sc.rows.filter((r) => r.variable === variable && r.lead_band === band);
  const orderedRows = [...rows].sort((a, b) => modelOrder(a.model) - modelOrder(b.model));
  const ftl = rows.find((r) => r.model === "FTL");
  const baseline = rows.find((r) => /spread/i.test(r.model));
  const delta = ftl?.bss != null && baseline?.bss != null ? ftl.bss - baseline.bss : null;

  return (
    <>
      <section className="score-controls" aria-label="Scorecard filters">
        <div className="score-filter-group">
          <span className="filter-label">Weather variable</span>
          <div className="score-tabs" role="group" aria-label="Weather variable">
            {variables.map((item) => <button key={item} aria-pressed={item === variable} onClick={() => setVariable(item)}>{VARIABLE_NAME[item] ?? item}</button>)}
          </div>
        </div>
        <div className="score-filter-group">
          <span className="filter-label">Forecast range</span>
          <div className="score-tabs score-tabs-compact" role="group" aria-label="Forecast range">
            {bands.map((item) => <button key={item} aria-pressed={item === band} onClick={() => setBand(item)}>{item}</button>)}
          </div>
        </div>
      </section>

      <div className="score-summary-line">
        <div><span className="summary-kicker">CURRENT COMPARISON</span><strong>{VARIABLE_NAME[variable] ?? variable}<span> / </span>{band}</strong></div>
        {delta != null && <div className={`delta-note ${delta >= 0 ? "delta-positive" : "delta-negative"}`}><span>Trust layer vs ensemble spread</span><strong>{delta > 0 ? "+" : ""}{f(delta)} BSS</strong></div>}
      </div>

      {orderedRows.length ? (
        <div className="model-comparison-grid">
          {orderedRows.map((row) => <ModelCard key={`${row.variable}-${row.lead_band}-${row.model}`} row={row} illustrative={sc.illustrative} />)}
        </div>
      ) : <EmptyState title="No comparison for this selection">The report does not contain rows for this variable and forecast range.</EmptyState>}

      <details className="metric-guide">
        <summary><span>How to read these measures</span><span className="guide-toggle">Show definitions</span></summary>
        <div className="metric-guide-grid">
          <div><b>Brier skill score</b><p>Measures probabilistic skill against climatology. Positive values indicate improvement over that reference.</p></div>
          <div><b>ROC-AUC</b><p>How well the model separates bust from non-bust cases across probability thresholds.</p></div>
          <div><b>Event count</b><p>Cases recorded in this report. Adjacent region-days can be correlated, so case totals are not automatically independent samples.</p></div>
        </div>
      </details>

      {sc.reliability && <Reliability rel={sc.reliability} />}

      <details className="report-provenance">
        <summary>Report provenance <span>View source, truth and split</span></summary>
        <div className="provenance-grid">
          <div><small>Forecast source</small><strong>{sc.source}</strong></div>
          <div><small>Verification truth</small><strong>{sc.truth}</strong></div>
          <div><small>Validation split</small><strong>{sc.split}</strong></div>
          <div><small>Report generated</small><strong>{sc.generated_at}</strong></div>
        </div>
      </details>
    </>
  );
}

function modelOrder(model: string): number {
  if (model === "FTL") return 0;
  if (/spread/i.test(model)) return 1;
  if (/climatology/i.test(model)) return 2;
  return 3;
}

function ModelCard({ row, illustrative }: { row: Scorecard["rows"][number]; illustrative: boolean }) {
  const meta = MODEL_META[row.model] ?? { label: row.model, detail: "Comparison model", kind: "other" };
  return (
    <article className={`model-card model-${meta.kind}`}>
      <div className="model-card-top">
        <span className={`model-mark ${meta.kind}`} aria-hidden="true">{meta.kind === "proposed" ? "FT" : meta.kind === "baseline" ? "↔" : "REF"}</span>
        <span className="model-kind">{meta.kind === "proposed" ? "PROPOSED" : meta.kind === "baseline" ? "BASELINE" : "REFERENCE"}</span>

      </div>
      <h2>{meta.label}</h2>
      <p className="model-description">{meta.detail}</p>
      <div className="primary-score">
        <span>Brier skill score</span>
        <strong className="num">{f(row.bss)}</strong>
        <small>95% interval {ci(row.bss_ci)}</small>
      </div>
      <div className="model-stat-row">
        <div><span>ROC-AUC</span><strong className="num">{f(row.auroc)}</strong><small>95% interval {ci(row.auroc_ci)}</small></div>
        <div><span>Cases in report</span><strong className="num">{row.n_events}</strong><small>{row.indicative ? "Indicative sample" : "Reported case count"}</small></div>
      </div>
      <div className="model-extra-row">
        <span>PR-AUC <b>{f(row.pr_auc)}</b></span>
        <span>90% coverage <b>{f(row.coverage90, 2)}</b></span>
        {row.lift != null && <span>Flagged lift <b>{row.lift.toFixed(1)}×</b></span>}
      </div>
      {row.indicative && <p className="indicative-note">Indicative only: fewer than 30 independent events.</p>}
    </article>
  );
}

function Reliability({ rel }: { rel: NonNullable<Scorecard["reliability"]> }) {
  const option = useMemo(() => {
    const base = themedBase() as Record<string, unknown>;
    const palette = [cssVar("--teal-700"), cssVar("--amber-700"), cssVar("--slate-500"), cssVar("--rust-700")];
    return {
      ...base,
      grid: { left: 48, right: 18, top: 34, bottom: 48, containLabel: true },
      tooltip: { ...(base.tooltip as object), trigger: "item", formatter: (p: { seriesName: string; data: number[] }) => {
        const forecast = p.data?.[0];
        const observed = p.data?.[1];
        return `${p.seriesName}<br/>Forecast: ${forecast == null ? "-" : forecast.toFixed(2)}<br/>Observed: ${observed == null ? "-" : observed.toFixed(2)}`;
      } },
      xAxis: { ...(base.xAxis as object), type: "value", min: 0, max: 1, name: "Forecast probability", nameLocation: "middle", nameGap: 30 },
      yAxis: { ...(base.yAxis as object), type: "value", min: 0, max: 1, name: "Observed frequency" },
      series: [
        { name: "Perfectly calibrated", type: "line", data: [[0, 0], [1, 1]], symbol: "none", lineStyle: { type: "dashed", color: cssVar("--slate-500") }, silent: true },
        ...Object.entries(rel).map(([model, pts], i) => ({
          name: model, type: "line", data: pts.map(([p, o]) => [p, o]), color: palette[i % palette.length], symbolSize: 7,
        })),
      ],
    };
  }, [rel]);
  return (
    <section className="reliability-section">
      <div className="reliability-heading"><div><span className="eyebrow">PROBABILITY QUALITY</span><h2>When it says 60%, does it happen 60% of the time?</h2></div><p>Points closer to the diagonal are better calibrated. Compare the curves, not just one threshold.</p></div>
      <div className="card reliability-card"><EChart option={option} height={330} /></div>
    </section>
  );
}

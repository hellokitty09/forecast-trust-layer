import { useMemo } from "react";
import { getScorecard } from "../api/client";
import { EChart, cssVar, themedBase } from "../components/EChart";
import { EmptyState } from "../components/EmptyState";
import { INDICATIVE_BELOW, type Scorecard } from "../lib/reports";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";

const f = (x: number | null | undefined, d = 3) => (x == null ? "—" : x.toFixed(d));
const ci = (c: [number, number] | null) => (c ? `[${c[0].toFixed(3)}, ${c[1].toFixed(3)}]` : "");

export function ScorecardPage() {
  const { token } = useApp();
  const sc = useAsync(getScorecard, [token]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Scorecard</h1>
          <p>
            For model developers: held-out skill against baselines, including the calibrated ensemble spread (the
            bar to beat). 95% CIs by block bootstrap over dates. Every score shows its event count; fewer than{" "}
            {INDICATIVE_BELOW} events is marked indicative. Lift = bust rate in flagged region-days ÷ overall bust rate.
          </p>
        </div>
        <span className="tag">SCIENTIST</span>
      </div>
      {sc.kind === "loading" && <div className="card empty muted">Loading…</div>}
      {sc.kind === "error" && (
        <div className="card">
          <EmptyState title="Scorecard could not be read">
            {sc.msg}. Nothing is shown rather than a partial or guessed scorecard.
          </EmptyState>
        </div>
      )}
      {sc.kind === "ok" && <ScorecardBody sc={sc.value} />}
    </div>
  );
}

function ScorecardBody({ sc }: { sc: Scorecard }) {
  const groups = useMemo(() => {
    const m = new Map<string, Scorecard["rows"]>();
    for (const r of sc.rows) {
      const k = `${r.variable} · ${r.system ?? "all systems"}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [sc]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="faint">
        Forecast: {sc.source} · Truth: <b>{sc.truth}</b> · split: {sc.split} · generated {sc.generated_at}
      </div>
      {groups.map(([k, rows]) => (
        <section className="card card-pad" key={k}>
          <h2 style={{ marginBottom: 10 }}>{k}</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl num">
              <thead>
                <tr>
                  <th>Lead band</th><th>Model</th><th className="r">Events</th><th className="r">BSS</th><th className="r">95% CI</th>
                  <th className="r">ROC-AUC</th><th className="r">95% CI</th><th className="r">PR-AUC</th><th className="r">90% cover</th><th className="r">Lift</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={/spread/i.test(r.model) ? "baseline-row" : undefined}>
                    <td>{r.lead_band}</td>
                    <td>{r.model}{/spread/i.test(r.model) && <span className="tag" style={{ marginLeft: 6 }}>BAR TO BEAT</span>}</td>
                    <td className="r">{r.n_events} {r.indicative && <span className="tag warn">INDICATIVE</span>}</td>
                    <td className="r">{f(r.bss)}</td><td className="r faint">{ci(r.bss_ci)}</td>
                    <td className="r">{f(r.auroc)}</td><td className="r faint">{ci(r.auroc_ci)}</td>
                    <td className="r">{f(r.pr_auc)}</td><td className="r">{f(r.coverage90, 2)}</td>
                    <td className="r">{r.lift == null ? "—" : `${r.lift.toFixed(1)}×`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {sc.reliability && <Reliability rel={sc.reliability} />}
    </div>
  );
}

function Reliability({ rel }: { rel: NonNullable<Scorecard["reliability"]> }) {
  const option = useMemo(() => {
    const base = themedBase() as Record<string, unknown>;
    const palette = [cssVar("--accent"), cssVar("--a-start"), cssVar("--a-chaos"), cssVar("--a-bias")];
    return {
      ...base,
      tooltip: { ...(base.tooltip as object), trigger: "item" },
      xAxis: { ...(base.xAxis as object), type: "value", min: 0, max: 1, name: "Forecast probability", nameLocation: "middle", nameGap: 28 },
      yAxis: { ...(base.yAxis as object), type: "value", min: 0, max: 1, name: "Observed frequency" },
      series: [
        { name: "perfect", type: "line", data: [[0, 0], [1, 1]], symbol: "none", lineStyle: { type: "dashed", color: cssVar("--ink-3") }, silent: true },
        ...Object.entries(rel).map(([model, pts], i) => ({
          name: model, type: "line", data: pts.map(([p, o]) => [p, o]), color: palette[i % palette.length], symbolSize: 7,
        })),
      ],
    };
  }, [rel]);
  return (
    <section className="card card-pad">
      <h2>Reliability diagram</h2>
      <EChart option={option} height={380} />
    </section>
  );
}

// Alerts list - the duty forecaster's "few risky region-days out of hundreds", and the SDMA's CAP feed.
import { useState } from "react";
import { getAlerts, getCap } from "../api/client";
import { InitPicker } from "../components/Controls";
import { EmptyState } from "../components/EmptyState";
import { errMsg } from "../components/TrustCardPanel";
import { CONF_COLOR, fmtInit, pct } from "../lib/display";
import { saveBlob } from "../lib/download";
import { VARIABLE_LABEL } from "../lib/schema";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";

const THRESHOLDS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];

export function AlertsPage() {
  const { init, setInit, token } = useApp();
  const [leadMin, setLeadMin] = useState(1);
  const [threshold, setThreshold] = useState(0.5);
  const [visibleCount, setVisibleCount] = useState(10);
  const res = useAsync(
    async () => getAlerts(init, leadMin, threshold),
    [init, leadMin, threshold, token],
  );
  const [capErr, setCapErr] = useState<string | null>(null);
  const visibleAlerts = res.kind === "ok" ? res.value.alerts.slice(0, visibleCount) : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Low-confidence alerts</h1>
          <p>
            Preview alert scenarios ranked by their generated bust-risk values. Forecasters: review this workflow before
            setting warning colour and wording. SDMAs: download the CAP alert, which carries the confidence and trust
            horizon.
          </p>
        </div>
        <span className="tag">FORECASTER · SDMA</span>
      </div>

        <div className="card card-pad alert-filters" style={{ marginBottom: 16 }}>
        <div className="controls">
          <InitPicker value={init} onChange={(value) => { setInit(value); setVisibleCount(10); }} />
          <label className="field">
            <span>From lead day</span>
            <select value={leadMin} onChange={(e) => { setLeadMin(Number(e.target.value)); setVisibleCount(10); }}>
              {Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>Day {i + 1}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Bust probability ≥</span>
            <select value={threshold} onChange={(e) => { setThreshold(Number(e.target.value)); setVisibleCount(10); }}>
              {THRESHOLDS.map((t) => <option key={t} value={t}>{pct(t)}</option>)}
            </select>
          </label>
          <span className="faint" style={{ alignSelf: "center" }}>LOW-confidence cards are always listed.</span>
        </div>
      </div>

      {res.kind === "loading" && <div className="card empty muted">Loading…</div>}
      {res.kind === "error" && (
        <div className="card">
          <EmptyState title="Alerts unavailable">
            {`The API could not be reached (${res.msg}).`}
          </EmptyState>
        </div>
      )}
      {res.kind === "ok" && (
        <section className="card card-pad alerts-results">
          <div className="alerts-results-head">
            <div>
              <span className="eyebrow">CYCLE REVIEW</span>
              <h2 className="alerts-cycle-title">{fmtInit(res.value.init_time)}</h2>
            </div>
            <div className="alerts-count"><strong>{res.value.alerts.length}</strong><span>region-day alerts</span></div>
            {res.value.unavailable > 0 && (
              <span className="tag warn" title="Region × lead × variable slots with no valid card">
                {res.value.unavailable} slots unavailable - status unknown
              </span>
            )}
          </div>
          {capErr && <div className="alerts-error" role="status">CAP export unavailable: {capErr}</div>}
          {res.value.alerts.length === 0 ? (
            <EmptyState title="No alerts at this threshold">
              No scored region-day reaches this threshold, and none is LOW confidence.
            </EmptyState>
          ) : (
            <div className="alert-list">
              {visibleAlerts.map((a, i) => (
                <article className="alert-item" key={a.card_id}>
                  <div className="alert-place">
                    <span className="alert-rank num">{String(i + 1).padStart(2, "0")}</span>
                    <div><h3>{a.region_name ?? a.region_id}</h3><p>{VARIABLE_LABEL[a.variable]} <span>·</span> Day {a.lead_day}</p></div>
                  </div>
                  <div className="alert-risk">
                    <strong className="num">{pct(a.bust_prob)}</strong>
                    <span>estimated bust probability</span>
                    <span className="conf-badge" style={{ background: CONF_COLOR[a.confidence] }}>{a.confidence} confidence</span>
                  </div>
                  <div className="alert-why"><span>Why it was flagged</span><p>{a.reasons.join("; ") || "No explanation available"}</p></div>
                  <button className="btn alert-cap" onClick={() => { setCapErr(null); getCap(a.card_id).then((b) => saveBlob(b, `cap-${a.card_id}.xml`)).catch((e: unknown) => setCapErr(errMsg(e))); }}>
                    Export CAP <span aria-hidden="true">↗</span>
                  </button>
                </article>
              ))}
            </div>
          )}
          {res.value.alerts.length > 10 && (
            <div className="alert-pagination">
              <span>Showing {Math.min(visibleCount, res.value.alerts.length)} of {res.value.alerts.length} alerts</span>
              {visibleCount < res.value.alerts.length ? (
                <button className="btn" onClick={() => setVisibleCount(Math.min(visibleCount + 10, res.value.alerts.length))}>Show 10 more</button>
              ) : (
                <button className="btn" onClick={() => setVisibleCount(10)}>Show first 10</button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

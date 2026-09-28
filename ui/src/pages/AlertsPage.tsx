// Alerts list — the duty forecaster's "few risky region-days out of hundreds", and the SDMA's CAP feed.
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
  const res = useAsync(
    async () => getAlerts(init, leadMin, threshold),
    [init, leadMin, threshold, token],
  );
  const [capErr, setCapErr] = useState<string | null>(null);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Low-confidence alerts</h1>
          <p>
            The region-days where today's forecast is most likely to bust, ranked. Forecasters: check these before
            setting warning colour and wording. SDMAs: download the CAP alert, which carries the confidence and trust
            horizon.
          </p>
        </div>
        <span className="tag">FORECASTER · SDMA</span>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="controls">
          <InitPicker value={init} onChange={setInit} />
          <label className="field">
            <span>From lead day</span>
            <select value={leadMin} onChange={(e) => setLeadMin(Number(e.target.value))}>
              {Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>Day {i + 1}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Bust probability ≥</span>
            <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
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
        <div className="card card-pad">
          <div className="tc-row" style={{ marginBottom: 10 }}>
            <div className="muted">
              init {fmtInit(res.value.init_time)} ·{" "}
              <b>{res.value.alerts.length}</b> alert{res.value.alerts.length === 1 ? "" : "s"}
            </div>
            {res.value.unavailable > 0 && (
              <span className="tag warn" title="Region × lead × variable slots with no valid card">
                {res.value.unavailable} SLOTS UNAVAILABLE — NOT ALERTS, BUT NOT "FINE" EITHER
              </span>
            )}
          </div>
          {capErr && <div className="faint" style={{ marginBottom: 8 }}>CAP unavailable: {capErr}</div>}
          {res.value.alerts.length === 0 ? (
            <EmptyState title="No alerts at this threshold">
              No scored region-day reaches this threshold, and none is LOW confidence.
            </EmptyState>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr><th>Region</th><th>Variable</th><th className="r">Lead</th><th className="r">Bust prob.</th><th>Confidence</th><th>Why</th><th /></tr>
                </thead>
                <tbody>
                  {res.value.alerts.map((a) => (
                    <tr key={a.card_id}>
                      <td>{a.region_name ?? a.region_id}</td>
                      <td>{VARIABLE_LABEL[a.variable]}</td>
                      <td className="r num">Day {a.lead_day}</td>
                      <td className="r num">{pct(a.bust_prob)}</td>
                      <td><span className="conf-badge" style={{ background: CONF_COLOR[a.confidence], padding: "1px 8px", fontSize: 12 }}>{a.confidence}</span></td>
                      <td className="muted">{a.reasons.join("; ") || "—"}</td>
                      <td>
                        <button className="btn" onClick={() => { setCapErr(null); getCap(a.card_id).then((b) => saveBlob(b, `cap-${a.card_id}.xml`)).catch((e: unknown) => setCapErr(errMsg(e))); }}>
                          CAP
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

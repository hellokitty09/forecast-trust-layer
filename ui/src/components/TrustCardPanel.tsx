import { useEffect, useState } from "react";
import { ApiError, getCap, getCases, getHistory, getTrustCard, verifyCard, type CardResult, type VerifyResult } from "../api/client";
import { regionName } from "../lib/regions";
import { CONFIDENCE_BANDS, VARIABLE_LABEL, type Analog, type TrustCard } from "../lib/schema";
import { CONF_COLOR, STATUS_EXPLAIN, STATUS_LABEL, fmtInit, pct } from "../lib/display";
import { useApp } from "../lib/state";
import { saveBlob } from "../lib/download";

export function errMsg(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) return "sign in with a forecaster or SDMA token to view Trust Cards";
  if (e instanceof ApiError && e.status === 403) return "your role cannot view this";
  return e instanceof Error ? e.message : "failed";
}

type Load<T> = { kind: "loading" } | { kind: "error"; msg: string } | { kind: "ok"; value: T };

export function TrustCardPanel({ regionId, onClose }: { regionId: string | null; onClose: () => void }) {
  const { init, lead, variable, token } = useApp();
  const [state, setState] = useState<Load<CardResult>>({ kind: "loading" });

  useEffect(() => {
    if (!regionId) return;
    let live = true;
    setState({ kind: "loading" });
    getTrustCard(init, lead, regionId, variable)
      .then((value) => live && setState({ kind: "ok", value }))
      .catch((e: unknown) => live && setState({ kind: "error", msg: errMsg(e) }));
    return () => {
      live = false;
    };
  }, [regionId, init, lead, variable, token]);

  if (!regionId) {
    return (
      <aside className="card tc">
        <div className="tc-status">
          <div className="big">Select a region</div>
          <div className="muted">Select a subdivision on the India map to open its Trust Card: bust probability, Error Anatomy, reasons and data source.</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="card tc" aria-live="polite">
      <div className="tc-head">
        <div className="tc-row">
          <h2>{regionName(regionId)}</h2>
          <button className="btn" onClick={onClose} aria-label="Close trust card">✕</button>
        </div>
        <div className="muted">
          {VARIABLE_LABEL[variable]} · Day {lead} · init {fmtInit(init)}
        </div>
      </div>
      {state.kind === "loading" && <div className="tc-status muted">Loading Trust Card…</div>}
      {state.kind === "error" && (
        <StatusBlock status="UNAVAILABLE" detail={`Trust Card could not be fetched (${state.msg}).`} />
      )}
      {state.kind === "ok" && state.value.card === null && (
        <StatusBlock status="UNAVAILABLE" detail={`Trust Card failed validation: ${state.value.error}`} />
      )}
      {state.kind === "ok" && state.value.card && <CardBody card={state.value.card} raw={state.value.raw} />}
    </aside>
  );
}

function StatusBlock({ status, detail }: { status: "UNAVAILABLE" | "NO_SKILL" | "OBS_UNCERTAIN"; detail?: string }) {
  return (
    <div className="tc-status">
      <div className="big">{STATUS_LABEL[status]}</div>
      <div className="muted">{STATUS_EXPLAIN[status]}</div>
      {detail && <div className="faint mono" style={{ fontSize: 11.5, wordBreak: "break-word" }}>{detail}</div>}
    </div>
  );
}

function CardBody({ card, raw }: { card: TrustCard; raw: unknown }) {
  const { role } = useApp();
  if (role === "sdma") return <SdmaSimplifiedCard card={card} />;
  return (
    <>

      {card.status === "OK" ? <Probability card={card} /> : <StatusBlock status={card.status} />}
      {card.status === "OK" && <NextReview card={card} />}
      {card.status === "OK" && card.anatomy && <Anatomy a={card.anatomy} />}
      {card.status === "OK" && card.reasons.length > 0 && (
        <section className="tc-sect">
          <h3>Signals behind this estimate</h3>
          <ul className="reasons">{card.reasons.map((r) => <li key={r}>{plainReason(r)}</li>)}</ul>
          {card.systems.length > 0 && <div className="tc-system-tags"><span>Weather pattern</span>{card.systems.map((system) => <b key={system}>{systemName(system)}</b>)}</div>}
        </section>
      )}
      {card.status === "OK" && <Details card={card} />}
      <LiveWatch card={card} />
      <Analogs card={card} />
      <Provenance card={card} raw={raw} />
    </>
  );
}



function SdmaSimplifiedCard({ card }: { card: TrustCard }) {
  const [capErr, setCapErr] = useState<string | null>(null);
  const downloadCap = () => {
    setCapErr(null);
    getCap(card.card_id)
      .then((b) => saveBlob(b, `cap-${card.card_id}.xml`))
      .catch((e: unknown) => setCapErr(errMsg(e)));
  };
  if (card.status !== "OK") return <StatusBlock status={card.status} />;
  return (
    <section className="tc-sect" style={{ display: "grid", gap: 10 }}>

      <div className="tc-row">
        <span className="conf-badge" style={{ background: CONF_COLOR[card.confidence!] }}>{card.confidence}</span>
        <span className="big-prob num">{pct(card.bust_prob)}</span>
      </div>
      <div>Forecast skill: <b>{card.skill_horizon_day != null ? `useful through Day ${card.skill_horizon_day}` : "no useful skill identified"}</b></div>
      {card.reasons[0] && <div className="muted">{plainReason(card.reasons[0])}</div>}
      <div className="faint">Use this as decision support and review again after the next model run.</div>
      <div className="tc-actions">
        <button className="btn" onClick={downloadCap}>CAP 1.2 XML</button>
      </div>
      {capErr && <div className="faint">CAP unavailable: {capErr}</div>}
    </section>
  );
}

function Probability({ card }: { card: TrustCard }) {
  const p = card.bust_prob!;
  const [lo, hi] = card.bust_prob_interval ?? [p, p];
  const conf = card.confidence!;
  return (
    <section className="tc-sect">
      <div className="tc-row">
        <div>
          <h3>Chance of a large forecast error</h3>
          <div className="big-prob num">{pct(p)}</div>
          {card.bust_prob_interval && <div className="muted num">Estimated range: {pct(lo)}–{pct(hi)}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="conf-badge" style={{ background: CONF_COLOR[conf] }}>{conf}</span>
          <div className="faint" style={{ marginTop: 4 }}>risk category</div>
        </div>
      </div>
      <p className="tc-plain-explainer">
        This is the estimated chance that the forecast error will be unusually large. <b>{conf}</b> means {conf === "HIGH" ? "below 20%" : conf === "MEDIUM" ? "20% to under 50%" : "50% or higher"} on this scale.
      </p>
      {card.bust_prob_interval && lo < 0.5 && hi >= 0.5 && (
        <p className="tc-range-note">The estimate range crosses the 50% high-risk threshold, so the result has meaningful uncertainty.</p>
      )}
      <div className="interval-track" aria-hidden="true">
        <div className="interval-bands">
          <i style={{ left: `${CONFIDENCE_BANDS.mediumFrom * 100}%` }} />
          <i style={{ left: `${CONFIDENCE_BANDS.lowFrom * 100}%` }} />
        </div>
        <div className="interval-band" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, background: CONF_COLOR[conf] }} />
        <div className="interval-point" style={{ left: `calc(${p * 100}% - 1.5px)` }} />
      </div>
      {card.novelty?.unprecedented && (
        <div className="tag warn">UNPRECEDENTED PATTERN - history cannot judge this forecast; confidence capped LOW</div>
      )}
    </section>
  );
}

function NextReview({ card }: { card: TrustCard }) {
  const a = card.anatomy;
  if (!a) return null;
  const lead = a.chaos >= a.start && a.chaos >= a.bias
    ? "Compare different model runs. They may disagree about the weather system's path or timing."
    : a.start >= a.bias
      ? "Compare this forecast with the next model run to see whether the outlook is settling."
      : "Check whether this model repeatedly forecasts too high or too low in this region.";
  return (
    <section className="tc-next-review">
      <span>Suggested review</span>
      <strong>{lead}</strong>
      {card.skill_horizon_day != null && <small>Forecast skill was useful through Day {card.skill_horizon_day} in the comparison period.</small>}
      <small>Decision support only. The forecaster remains responsible for official warning decisions.</small>
    </section>
  );
}

const ANATOMY = [
  { key: "bias", label: "Local model bias", meaning: "A repeated tendency to forecast too high or too low here.", action: "Check the model's past local error.", color: "var(--a-bias)" },
  { key: "start", label: "Change between model runs", meaning: "Recent forecasts disagree about how the atmosphere is developing.", action: "Compare with the next model run.", color: "var(--a-start)" },
  { key: "chaos", label: "Sensitive weather pattern", meaning: "Small changes in storm path or timing may change the outcome.", action: "Compare the ensemble (many model runs).", color: "var(--a-chaos)" },
] as const;

function Anatomy({ a }: { a: NonNullable<TrustCard["anatomy"]> }) {
  const total = a.bias + a.start + a.chaos || 1;
  return (
    <section className="tc-sect">
      <div className="tc-section-heading">
        <h3>What is driving the uncertainty?</h3>
        <p>These percentages show which signal groups influenced the estimate. They are not measured shares of the actual error.</p>
      </div>
      <div className="anatomy-bar" role="img" aria-label={ANATOMY.map((x) => `${x.label} ${pct(a[x.key] / total)}`).join(", ")}>
        {ANATOMY.map((x) => (
          <div key={x.key} style={{ width: `${(a[x.key] / total) * 100}%`, background: x.color }}>
            {a[x.key] / total >= 0.12 ? pct(a[x.key] / total) : ""}
          </div>
        ))}
      </div>
      <div className="anatomy-rows">
        {ANATOMY.map((x) => (
          <div className="anatomy-row" key={x.key}>
            <span className="swatch" style={{ background: x.color }} />
            <div>
              <b>{x.label}</b>
              <small>{x.meaning}</small>
              <small className="anatomy-action">Next: {x.action}</small>
            </div>
            <span className="num">{pct(a[x.key] / total)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Details({ card }: { card: TrustCard }) {
  const err = card.expected_error ?? (card.expected_error_mm ? { unit: "mm", ...card.expected_error_mm } : null);
  return (
    <details className="tc-disclosure">
      <summary><span><b>More forecast details</b><small>Error range, observation check and dates</small></span><i aria-hidden="true" /></summary>
      <div className="tc-disclosure-body">
        {err && <div className="tc-detail-item"><span>Estimated forecast error</span><b className="num">{err.q10} / {err.q50} / {err.q90} {err.unit}</b><small>Lower / middle / upper model estimates (q10 / q50 / q90).</small></div>}
        {card.heavy_rain && <div className="tc-detail-grid">
          <div className="tc-detail-item"><span>Chance heavy rain is missed</span><b>{pct(card.heavy_rain.p_miss)}</b></div>
          <div className="tc-detail-item"><span>Chance of a heavy-rain false alarm</span><b>{pct(card.heavy_rain.p_false_alarm)}</b></div>
        </div>}
        {card.skill_horizon_day != null && <div className="tc-detail-item"><span>Useful-skill horizon</span><b>Through Day {card.skill_horizon_day}</b><small>The last lead day with skill above the climatology reference.</small></div>}
        <div className="tc-detail-grid">
          <div className="tc-detail-item"><span>Observation check</span><b>{card.obs_certainty ?? "Not available"}</b></div>
          <div className="tc-detail-item"><span>Valid date</span><b>{card.valid_date}</b></div>
        </div>
        {card.novelty?.unprecedented && <div className="tag warn">Unusual pattern: available history may not be a useful guide.</div>}
        <div className="tc-detail-item"><span>Input source</span><b>{card.inputs.source}</b></div>
        <div className="tc-detail-item"><span>Issued</span><b>{fmtIssued(card.issued_at)}</b></div>
      </div>
    </details>
  );
}

const SYSTEM_NAMES: Record<string, string> = {
  MONSOON_LPS: "Monsoon low-pressure system",
  WD_TROUGH: "Western disturbance trough",
  MONSOON_TROUGH: "Monsoon trough",
  MJO_CONVECTION: "Madden-Julian Oscillation activity",
  HEAT_WAVE: "Heat wave",
  ANTI_CYCLONE: "Anticyclone",
  SOMALI_JET: "Somali jet",
  CROSS_EQ_FLOW: "Cross-equatorial flow",
  TEJ: "Tropical easterly jet",
  STJ: "Subtropical jet",
};

function systemName(system: string): string {
  return SYSTEM_NAMES[system] ?? system.replaceAll("_", " ").toLowerCase();
}

function plainReason(reason: string): string {
  const known: Record<string, string> = {
    "LPS track spread over central India - ensemble members diverge on landfall position":
      "Model runs disagree about where the monsoon low-pressure system may travel and reach the coast.",
    "Run-to-run flip in cross-equatorial flow intensity":
      "Recent model runs disagree about the strength of winds flowing across the equator.",
    "BSISO entering break phase - monsoon trough retreating northward":
      "The monsoon pattern may be shifting toward a break in rainfall.",
    "WD trough timing and amplitude show bimodal ensemble distribution":
      "Model runs show two different possibilities for when and how strongly the western disturbance may arrive.",
    "Moisture convergence over Western Ghats highly sensitive to SST forcing":
      "Rainfall over the Western Ghats may change with small differences in warm ocean conditions and incoming moisture.",
    "Uncertainty in mid-tropospheric vortex position over Bay of Bengal":
      "Model runs disagree about where a rotating weather system may form over the Bay of Bengal.",
    "WD arrival timing uncertain over J&K - ±24h spread in ensemble":
      "Model runs differ by about a day on when the western disturbance may reach Jammu and Kashmir.",
    "Soil-moisture feedback amplifying surface temperature uncertainty":
      "Differences in soil wetness may increase uncertainty in surface temperatures.",
    "Run-to-run jump in 850 hPa temperature advection":
      "Recent model runs disagree about how winds may move warm or cool air into the region.",
    "Anti-cyclonic subsidence strength uncertain over Rajasthan":
      "Model runs disagree about sinking air over Rajasthan, which can affect temperatures.",
    "Urban heat island signal not resolved at model grid spacing":
      "The model grid may be too coarse to capture extra warmth within cities.",
    "Somali Jet strength uncertain - linked to Indian Ocean dipole phase":
      "Model runs disagree about the strength of the Somali winds, which can affect monsoon moisture.",
    "LPS track spread affecting low-level convergence patterns":
      "Different low-pressure-system paths may change where low-level winds bring air together.",
    "Monsoon onset surge timing varies by 36h across ensemble":
      "Model runs differ by about a day and a half on when the monsoon flow may strengthen.",
    "Cross-equatorial flow modulation by MJO phase 2-3 transition":
      "A changing tropical weather pattern may strengthen or weaken winds flowing across the equator.",
    "200 hPa Tropical Easterly Jet position uncertain ±2° latitude":
      "Model runs disagree on the location of the high-altitude tropical easterly winds.",
    "Subtropical westerly jet interaction with tropical easterlies":
      "The interaction between high-altitude westerly and easterly winds is uncertain.",
    "ENSO teleconnection signal weakening at extended leads":
      "The influence of El Niño or La Niña becomes less clear at longer forecast lead times.",
  };
  if (known[reason]) return known[reason]!;
  return reason
    .replaceAll("ensemble members", "model runs")
    .replaceAll("ensemble distribution", "model-run range")
    .replaceAll("LPS", "low-pressure system")
    .replaceAll("WD", "western disturbance")
    .replaceAll("850 hPa", "low-level winds")
    .replaceAll("200 hPa", "upper-level winds")
    .replaceAll("SST", "sea-surface temperature")
    .replaceAll("cross-equatorial flow", "winds flowing across the equator");
}

function fmtIssued(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function LiveWatch({ card }: { card: TrustCard }) {
  const { init, lead, variable, token } = useApp();
  const [s, setS] = useState<Load<TrustCard[]>>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    setS({ kind: "loading" });
    getHistory(init, lead, card.region_id, variable)
      .then((value) => live && setS({ kind: "ok", value }))
      .catch((e: unknown) => live && setS({ kind: "error", msg: errMsg(e) }));
    return () => {
      live = false;
    };
  }, [init, lead, card.region_id, card.card_id, card.illustrative, variable, token]);

  return (
    <section className="tc-sect">
      <h3>Updates since this card was issued</h3>

      {s.kind === "loading" && <div className="muted">Loading cycle history…</div>}
      {s.kind === "error" && <div className="muted">Could not load cycle history ({s.msg}).</div>}
      {s.kind === "ok" && (
        <>
          <div className="muted">
            {card.illustrative
              ? `${s.value.length} versions`
              : s.value.length <= 1
                ? `Not updated since first issue (${fmtIssued(card.issued_at)}).`
                : `Updated ${s.value.length - 1}× since first issue. Every version below is signed and chained.`}
          </div>
          {s.value.length > 0 && (
            <ol className="timeline">
              {s.value.map((v, index) => (
                <li key={v.card_id} className={v.card_id === card.card_id ? "current" : undefined}>
                  <span className="t-dot" style={{ background: v.confidence ? CONF_COLOR[v.confidence] : "var(--c-unavail)" }} />
                  <div>
                    <div>
                      <b>{card.illustrative ? `Run ${index + 1} · ${v.confidence} · ${pct(v.bust_prob)}` : v.status === "OK" ? `${v.confidence} · ${pct(v.bust_prob)}` : STATUS_LABEL[v.status]}</b>
                      {v.card_id === card.card_id && <span className="tag" style={{ marginLeft: 6 }}>CURRENT</span>}
                    </div>
                    <small className="faint">{fmtIssued(v.issued_at)}{v.update_reason ? ` - ${v.update_reason}` : ""}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function Analogs({ card }: { card: TrustCard }) {
  const [s, setS] = useState<Load<Analog[]>>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    setS({ kind: "loading" });
    getCases(card.card_id, card.variable, card.region_id)
      .then((value) => live && setS({ kind: "ok", value }))
      .catch((e: unknown) => live && setS({ kind: "error", msg: errMsg(e) }));
    return () => {
      live = false;
    };
  }, [card.card_id, card.variable, card.region_id, card.illustrative]);
  const busted = s.kind === "ok" ? s.value.filter((a) => a.busted != null) : [];
  return (
    <section className="tc-sect">
      <h3>Comparable-case examples</h3>

      {s.kind === "loading" && <div className="muted">Finding comparable examples…</div>}
      {s.kind === "error" && <div className="muted">Could not load comparable examples ({s.msg}).</div>}
      {s.kind === "ok" && s.value.length === 0 && (
        <div className="muted">No analogs returned.</div>
      )}
      {s.kind === "ok" && s.value.length > 0 && (
        <>
          <div className="muted">
            Resembles <b>{s.value.length}</b> past case{s.value.length === 1 ? "" : "s"}
            {busted.length > 0 && <> - <b>{busted.filter((a) => a.busted).length} of {busted.length}</b> busted</>}.
          </div>
          <table className="tbl tc-analogs">
          <thead><tr><th>Date</th><th>Weather system</th><th>Scenario detail</th><th>Outcome</th></tr></thead>
          <tbody>
            {s.value.map((a) => (
              <tr key={a.date + a.system + a.outcome}>
                <td className="num">{a.date}</td>
                <td>{a.system ?? "-"}</td>
                <td>{a.outcome}</td>
                <td>{a.busted == null ? "Not recorded" : a.busted ? "Bust" : "Held"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </section>
  );
}

function Provenance({ card, raw }: { card: TrustCard; raw: unknown }) {
  const [v, setV] = useState<Load<VerifyResult> | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const check = () => {
    setV({ kind: "loading" });
    verifyCard(raw)
      .then((value) => setV({ kind: "ok", value }))
      .catch((e: unknown) => setV({ kind: "error", msg: e instanceof Error ? e.message : "failed" }));
  };
  const [capErr, setCapErr] = useState<string | null>(null);
  const download = async () => {
    setDownloaded(false);
    setDownloadError(null);
    try {
      let exportData: unknown = raw;
      if (card.illustrative) {
        const [updates, cases] = await Promise.all([
          getHistory(card.init_time, card.lead_day, card.region_id, card.variable),
          getCases(card.card_id, card.variable, card.region_id),
        ]);
        exportData = {
          export_type: "illustrative_demo",
          note: "Example values only. This file contains no verified forecast, observation, or historical case data.",
          card: raw,
          cycle_update_examples: updates,
          comparable_case_examples: cases,
        };
      }
      saveBlob(new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" }), `trustcard-${card.card_id}.json`);
      setDownloaded(true);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Could not prepare the JSON download.");
    }
  };
  const downloadCap = () => {
    setCapErr(null);
    getCap(card.card_id)
      .then((b) => saveBlob(b, `cap-${card.card_id}.xml`))
      .catch((e: unknown) => setCapErr(errMsg(e)));
  };
  return (
    <section className="tc-sect">
      <h3>Card record</h3>
      <div className="tc-row">
        <SignatureBadge card={card} v={v} />
        {card.signature && (
          <button className="btn" onClick={check} disabled={v?.kind === "loading"}>Verify signature</button>
        )}
      </div>
      <div className="tc-record-explainer">A digital signature lets others check that a card came from the service and was not changed.</div>
      <details className="tc-disclosure tc-record-disclosure">
        <summary><span><b>Record information</b><small>Source, model and card ID</small></span><i aria-hidden="true" /></summary>
        <div className="tc-disclosure-body">
          <div className="tc-detail-item"><span>Issued</span><b>{fmtIssued(card.issued_at)}</b></div>
          <div className="tc-detail-item"><span>Model</span><b>{card.model.version}</b></div>
          <div className="tc-detail-item"><span>Input source</span><b>{card.inputs.source}</b></div>
          <div className="tc-detail-item"><span>Card ID</span><b className="mono tc-break">{card.card_id}</b></div>
        </div>
      </details>
      <div className="tc-actions">
        <button className="btn" onClick={download}>Download JSON</button>
        {card.signature && <button className="btn" onClick={downloadCap}>CAP 1.2 XML</button>}
      </div>
      {downloaded && <div className="tc-download-status" role="status">JSON downloaded.</div>}
      {downloadError && <div className="tc-download-status" role="alert">Download failed: {downloadError}</div>}
      {capErr && <div className="faint">CAP unavailable: {capErr}</div>}
    </section>
  );
}

function SignatureBadge({ card, v }: { card: TrustCard; v: Load<VerifyResult> | null }) {
  if (!card.signature) return <span className="sig bad">Unsigned card</span>;
  if (!v) return <span className="sig">Signed · not yet verified</span>;
  if (v.kind === "loading") return <span className="sig">Verifying…</span>;
  if (v.kind === "error") return <span className="sig">Verification unavailable</span>;
  return v.value.valid ? <span className="sig valid">✓ Signature valid</span> : <span className="sig bad">✕ Signature invalid</span>;
}

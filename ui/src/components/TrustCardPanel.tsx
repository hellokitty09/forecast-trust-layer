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
          <div className="muted">Click any tile to open its Trust Card: bust probability, Error Anatomy, reasons and provenance.</div>
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
      {card.status === "OK" && card.anatomy && <Anatomy a={card.anatomy} />}
      {card.status === "OK" && card.reasons.length > 0 && (
        <section className="tc-sect">
          <h3>Why</h3>
          <ul className="reasons">{card.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {card.systems.length > 0 && <div className="faint">Systems: {card.systems.join(", ")}</div>}
        </section>
      )}
      {card.status === "OK" && <Details card={card} />}
      {card.status === "OK" && <DataQuality card={card} />}
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
      <div>Trust horizon: <b>{card.skill_horizon_day != null ? `Day ${card.skill_horizon_day}` : "no useful skill"}</b></div>
      {card.reasons[0] && <div className="muted">{card.reasons[0]}</div>}
      <div className="faint">Re-check after the next model run.</div>
      <div className="tc-actions">
        <button className="btn" onClick={downloadCap}>CAP 1.2 XML</button>
      </div>
      {capErr && <div className="faint">CAP unavailable: {capErr}</div>}
    </section>
  );
}

function DataQuality({ card }: { card: TrustCard }) {
  return (
    <div className="notice">
      Data quality: {card.inputs.source} · issued {fmtIssued(card.issued_at)} · observation certainty {card.obs_certainty ?? "—"}
    </div>
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
          <h3>Bust probability</h3>
          <div className="big-prob num">{pct(p)}</div>
          {card.bust_prob_interval && <div className="muted num">range {pct(lo)} – {pct(hi)}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="conf-badge" style={{ background: CONF_COLOR[conf] }}>{conf}</span>
          <div className="faint num" style={{ marginTop: 4 }} title="Trust score = 100 × (1 − bust probability). Shown with its formula, never as an unexplained number.">
            Trust score {Math.round((1 - p) * 100)}/100
          </div>
        </div>
      </div>
      <div className="interval-track" aria-hidden="true">
        <div className="interval-bands">
          <i style={{ left: `${CONFIDENCE_BANDS.mediumFrom * 100}%` }} />
          <i style={{ left: `${CONFIDENCE_BANDS.lowFrom * 100}%` }} />
        </div>
        <div className="interval-band" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, background: CONF_COLOR[conf] }} />
        <div className="interval-point" style={{ left: `calc(${p * 100}% - 1.5px)` }} />
      </div>
      {card.novelty?.unprecedented && (
        <div className="tag warn">UNPRECEDENTED PATTERN — history cannot judge this forecast; confidence capped LOW</div>
      )}
    </section>
  );
}

const ANATOMY = [
  { key: "bias", label: "Model bias", action: "Auto-correctable", color: "var(--a-bias)" },
  { key: "start", label: "Uncertain start", action: "Wait for next cycle", color: "var(--a-start)" },
  { key: "chaos", label: "Chaotic weather", action: "Use ensemble / probabilistic wording", color: "var(--a-chaos)" },
] as const;

function Anatomy({ a }: { a: NonNullable<TrustCard["anatomy"]> }) {
  const total = a.bias + a.start + a.chaos || 1;
  return (
    <section className="tc-sect">
      <h3>Error Anatomy</h3>
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
            <div>{x.label}<small>{x.action}</small></div>
            <span className="num">{pct(a[x.key] / total)}</span>
          </div>
        ))}
      </div>
      <div className="faint" style={{ fontSize: 11.5 }}>Attribution by physical feature group (grouped SHAP), not exact physics.</div>
    </section>
  );
}

function Details({ card }: { card: TrustCard }) {
  const err = card.expected_error ?? (card.expected_error_mm ? { unit: "mm", ...card.expected_error_mm } : null);
  return (
    <section className="tc-sect">
      <h3>Details</h3>
      <dl className="kv num">
        {err && (<><dt>Expected error q10 / q50 / q90</dt><dd>{err.q10} / {err.q50} / {err.q90} {err.unit}</dd></>)}
        {card.heavy_rain && (<><dt>Heavy-rain miss</dt><dd>{pct(card.heavy_rain.p_miss)}</dd><dt>Heavy-rain false alarm</dt><dd>{pct(card.heavy_rain.p_false_alarm)}</dd></>)}
        {card.skill_horizon_day != null && (<><dt>Skill horizon</dt><dd>Day {card.skill_horizon_day}</dd></>)}
        {card.obs_certainty && (<><dt>Observation certainty</dt><dd>{card.obs_certainty}</dd></>)}
        {card.novelty && (<><dt>Novelty score</dt><dd>{card.novelty.score.toFixed(2)}</dd></>)}
        <dt>Valid date</dt><dd>{card.valid_date}</dd>
      </dl>
    </section>
  );
}

function fmtIssued(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function LiveWatch({ card }: { card: TrustCard }) {
  const { init, lead, variable, token } = useApp();
  const [s, setS] = useState<Load<TrustCard[]>>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    getHistory(init, lead, card.region_id, variable)
      .then((value) => live && setS({ kind: "ok", value }))
      .catch((e: unknown) => live && setS({ kind: "error", msg: errMsg(e) }));
    return () => {
      live = false;
    };
  }, [init, lead, card.region_id, card.card_id, variable, token]);

  return (
    <section className="tc-sect">
      <h3>Live Bust Watch</h3>
      {s.kind === "loading" && <div className="muted">Loading history…</div>}
      {s.kind === "error" && <div className="muted">History unavailable ({s.msg}).</div>}
      {s.kind === "ok" && (
        <>
          <div className="muted">
            {s.value.length <= 1
              ? `Not updated since first issue (${fmtIssued(card.issued_at)}).`
              : `Updated ${s.value.length - 1}× since first issue. Every version below is signed and chained.`}
          </div>
          {s.value.length > 1 && (
            <ol className="timeline">
              {s.value.map((v) => (
                <li key={v.card_id} className={v.card_id === card.card_id ? "current" : undefined}>
                  <span className="t-dot" style={{ background: v.confidence ? CONF_COLOR[v.confidence] : "var(--c-unavail)" }} />
                  <div>
                    <div>
                      <b>{v.status === "OK" ? `${v.confidence} · ${pct(v.bust_prob)}` : STATUS_LABEL[v.status]}</b>
                      {v.card_id === card.card_id && <span className="tag" style={{ marginLeft: 6 }}>CURRENT</span>}
                    </div>
                    <small className="faint">{fmtIssued(v.issued_at)}{v.update_reason ? ` — ${v.update_reason}` : ""}</small>
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
    getCases(card.card_id, card.variable, card.region_id)
      .then((value) => live && setS({ kind: "ok", value }))
      .catch((e: unknown) => live && setS({ kind: "error", msg: errMsg(e) }));
    return () => {
      live = false;
    };
  }, [card.card_id, card.variable, card.region_id]);
  const busted = s.kind === "ok" ? s.value.filter((a) => a.busted != null) : [];
  return (
    <section className="tc-sect">
      <h3>Similar past cases</h3>
      {s.kind === "loading" && <div className="muted">Loading…</div>}
      {s.kind === "error" && <div className="muted">Unavailable ({s.msg}).</div>}
      {s.kind === "ok" && s.value.length === 0 && (
        <div className="muted">No analogs returned.</div>
      )}
      {s.kind === "ok" && s.value.length > 0 && (
        <>
          <div className="muted">
            Resembles <b>{s.value.length}</b> past case{s.value.length === 1 ? "" : "s"}
            {busted.length > 0 && (
              <> — <b>{busted.filter((a) => a.busted).length} of {busted.length}</b> busted</>
            )}
            .
          </div>
          <table className="tbl">
          <thead><tr><th>Date</th><th>System</th><th>What went wrong</th><th>Outcome</th></tr></thead>
          <tbody>
            {s.value.map((a) => (
              <tr key={a.date + a.outcome}>
                <td className="num">{a.date}</td>
                <td>{a.system ?? "—"}</td>
                <td>{a.outcome}</td>
                <td>{a.busted == null ? "—" : a.busted ? "✕ bust" : "✓ held"}</td>
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
  const check = () => {
    setV({ kind: "loading" });
    verifyCard(raw)
      .then((value) => setV({ kind: "ok", value }))
      .catch((e: unknown) => setV({ kind: "error", msg: e instanceof Error ? e.message : "failed" }));
  };
  const [capErr, setCapErr] = useState<string | null>(null);
  const download = () => saveBlob(new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" }), `trustcard-${card.card_id}.json`);
  const downloadCap = () => {
    setCapErr(null);
    getCap(card.card_id)
      .then((b) => saveBlob(b, `cap-${card.card_id}.xml`))
      .catch((e: unknown) => setCapErr(errMsg(e)));
  };
  return (
    <section className="tc-sect">
      <h3>Provenance</h3>
      <div className="tc-row">
        <SignatureBadge card={card} v={v} />
        {card.signature && (
          <button className="btn" onClick={check} disabled={v?.kind === "loading"}>Verify signature</button>
        )}
      </div>
      <dl className="kv">
        <dt>Issued</dt><dd>{fmtIssued(card.issued_at)}</dd>
        <dt>Model</dt><dd className="mono">{card.model.version}</dd>
        <dt>Input source</dt><dd>{card.inputs.source}</dd>
        <dt>Card id</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{card.card_id}</dd>
      </dl>
      <div className="tc-actions">
        <button className="btn" onClick={download}>Download JSON</button>
        {card.signature && <button className="btn" onClick={downloadCap}>CAP 1.2 XML</button>}
      </div>
      {capErr && <div className="faint">CAP unavailable: {capErr}</div>}
    </section>
  );
}

function SignatureBadge({ card, v }: { card: TrustCard; v: Load<VerifyResult> | null }) {
  if (!card.signature) return <span className="sig bad">✕ No signature</span>;
  if (!v) return <span className="sig">Signed · not yet verified</span>;
  if (v.kind === "loading") return <span className="sig">Verifying…</span>;
  if (v.kind === "error") return <span className="sig">Verification unavailable</span>;
  return v.value.valid ? <span className="sig valid">✓ Signature valid</span> : <span className="sig bad">✕ Signature invalid</span>;
}

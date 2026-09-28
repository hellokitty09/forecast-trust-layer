import { useEffect, useState } from "react";
import { getReport } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { LeadSlider } from "../components/Controls";
import { MapLegend, RegionTiles, fillFor } from "../components/TileMap";
import { ReplayCaseSchema, ReplayIndexSchema, type ReplayCase } from "../lib/reports";
import { parseMapRegion } from "../lib/schema";
import { STATUS_LABEL, STATUS_SHORT, fmtInit, pct } from "../lib/display";
import { regionName } from "../lib/regions";
import { useAsync } from "../lib/useAsync";

export function ReplayPage() {
  const index = useAsync(async () => ReplayIndexSchema.parse(await getReport<unknown>("replay/index.json")), []);
  const [file, setFile] = useState<string | null>(null);

  useEffect(() => {
    if (index.kind === "ok" && !file && index.value.cases[0]) setFile(index.value.cases[0].file);
  }, [index, file]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Replay</h1>
          <p>Step through a real historical forecast cycle lead day by lead day, then reveal what actually happened.</p>
        </div>
        {index.kind === "ok" && index.value.cases.length > 0 && (
          <label className="field">
            <span>Case</span>
            <select value={file ?? ""} onChange={(e) => setFile(e.target.value)}>
              {index.value.cases.map((c) => <option key={c.file} value={c.file}>{c.title} — {fmtInit(c.init_time)}</option>)}
            </select>
          </label>
        )}
      </div>
      {index.kind === "loading" && <div className="card empty muted">Loading…</div>}
      {(index.kind === "error" || (index.kind === "ok" && index.value.cases.length === 0)) && (
        <div className="card">
          <EmptyState title="No replay cases available">
            Replays are built from real historical cycles with verified outcomes.
          </EmptyState>
        </div>
      )}
      {file && <ReplayCaseView file={file} />}
    </div>
  );
}

function ReplayCaseView({ file }: { file: string }) {
  const c = useAsync(async () => ReplayCaseSchema.parse(await getReport<unknown>(`replay/${file}`)), [file]);
  const [lead, setLead] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { setLead(1); setReveal(false); }, [file]);

  if (c.kind === "loading") return <div className="card empty muted">Loading case…</div>;
  if (c.kind === "error") return <div className="card"><EmptyState title="Case file unreadable">{c.msg}</EmptyState></div>;
  return <ReplayBody rc={c.value} lead={lead} setLead={(n) => { setLead(n); setReveal(false); }} reveal={reveal} setReveal={setReveal} sel={sel} setSel={setSel} />;
}

function ReplayBody({ rc, lead, setLead, reveal, setReveal, sel, setSel }: {
  rc: ReplayCase; lead: number; setLead: (n: number) => void; reveal: boolean; setReveal: (b: boolean) => void; sel: string | null; setSel: (s: string) => void;
}) {
  const props = rc.leads[String(lead)] ?? {};
  const truth = rc.truth[String(lead)] ?? {};
  const cell = (id: string) => parseMapRegion(props[id]) ?? undefined;
  return (
    <div className="map-layout">
      <div className="card map-wrap">
        <div className="map-meta">
          <span>{rc.title} · init {fmtInit(rc.init_time)} · {rc.variable}</span>
          <span>{rc.source}</span>
        </div>
        <div className="controls" style={{ justifyContent: "space-between", padding: "0 4px 10px" }}>
          <LeadSlider value={lead} onChange={setLead} />
          <button className="btn primary" onClick={() => setReveal(!reveal)}>{reveal ? "Hide truth" : "Reveal what happened"}</button>
        </div>
        <RegionTiles
          ariaLabel="Replay"
          selected={sel}
          onSelect={setSel}
          spec={(id) => {
            const m = cell(id);
            const t = truth[id];
            return {
              fill: fillFor(m),
              ink: m?.status === "OK" ? "#fff" : "var(--ink)",
              sub: reveal ? (t === true ? "✕ BUST" : t === false ? "✓ held" : "obs ?") : m?.status === "OK" ? pct(m.bust_prob) : m ? STATUS_SHORT[m.status] : "",
              label: `${m?.status === "OK" ? `bust probability ${pct(m.bust_prob)}` : m ? STATUS_LABEL[m.status] : "no data"}${reveal ? `; outcome: ${t === true ? "bust" : t === false ? "no bust" : "observation uncertain"}` : ""}`,
            };
          }}
        />
        <MapLegend />
      </div>
      <aside className="card tc">
        <div className="tc-head"><h2>{rc.title}</h2></div>
        <div className="tc-sect">
          {rc.description && <p style={{ margin: 0 }}>{rc.description}</p>}
          {sel && (
            <div>
              <b>{regionName(sel)}</b> · Day {lead}: predicted {pct(cell(sel)?.bust_prob)} bust probability
              {reveal && <> — outcome: <b>{truth[sel] === true ? "bust" : truth[sel] === false ? "no bust" : "observation uncertain"}</b></>}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

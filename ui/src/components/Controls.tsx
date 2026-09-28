import { VARIABLES, VARIABLE_LABEL, type Variable } from "../lib/schema";

export function VariablePicker({ value, onChange }: { value: Variable; onChange: (v: Variable) => void }) {
  return (
    <div className="field">
      <span>Variable</span>
      <div className="seg" role="group" aria-label="Variable">
        {VARIABLES.map((v) => (
          <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>{VARIABLE_LABEL[v]}</button>
        ))}
      </div>
    </div>
  );
}

export function LeadSlider({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="field lead-slider">
      <span>Lead day · Day {value}</span>
      <input type="range" min={1} max={10} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="lead-ticks" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (i + 1 === value ? <b key={i}>{i + 1}</b> : <span key={i}>{i + 1}</span>))}
      </div>
    </label>
  );
}

/** init_time as UTC, edited as a UTC date + cycle (00/06/12/18). */
export function InitPicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const d = new Date(value);
  const date = d.toISOString().slice(0, 10);
  const hour = d.getUTCHours();
  const set = (dateStr: string, h: number) => onChange(`${dateStr}T${String(h).padStart(2, "0")}:00:00Z`);
  return (
    <div className="controls" style={{ gap: 8 }}>
      <label className="field">
        <span>Init date (UTC)</span>
        <input type="date" value={date} onChange={(e) => e.target.value && set(e.target.value, hour)} />
      </label>
      <label className="field">
        <span>Cycle</span>
        <select value={hour} onChange={(e) => set(date, Number(e.target.value))}>
          {[0, 6, 12, 18].map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")} UTC</option>)}
        </select>
      </label>
    </div>
  );
}

// Schematic tile layout of IMD subdivisions. Deliberately NOT geographic
// (hard rule 9) — used until official boundaries are supplied.
import { REGIONS } from "../lib/regions";
import type { MapSnapshot, MapRegion } from "../lib/schema";
import { CONF_COLOR, STATUS_LABEL, STATUS_SHORT, pct } from "../lib/display";

const W = 88, H = 64, GAP = 4;
const COLS = Math.max(...REGIONS.map((r) => r.col)) + 1;
const ROWS = Math.max(...REGIONS.map((r) => r.row)) + 1;

export function fillFor(m: MapRegion | undefined): string {
  if (!m) return "var(--c-unavail)";
  switch (m.status) {
    case "OK":
      return m.confidence ? CONF_COLOR[m.confidence] : "var(--c-unavail)";
    case "NO_SKILL":
      return "url(#hatch-noskill)";
    case "OBS_UNCERTAIN":
      return "url(#dots-obs)";
    default:
      return "var(--c-unavail)";
  }
}

export function MapPatterns() {
  return (
    <defs>
      <pattern id="hatch-noskill" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="var(--c-unavail)" />
        <line x1="0" y1="0" x2="0" y2="8" stroke="var(--c-noskill)" strokeWidth="4" />
      </pattern>
      <pattern id="dots-obs" width="7" height="7" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="var(--c-unavail)" />
        <circle cx="3.5" cy="3.5" r="1.7" fill="var(--c-obs)" />
      </pattern>
    </defs>
  );
}

function textColor(m: MapRegion | undefined): string {
  return m?.status === "OK" && m.confidence ? "#fff" : "var(--ink)";
}

export interface TileSpec {
  fill: string;
  ink: string;
  sub: string;
  label: string;
}

/** Generic schematic tile grid; callers decide what each tile shows. */
export function RegionTiles({
  spec,
  selected,
  onSelect,
  ariaLabel,
}: {
  spec: (id: string) => TileSpec;
  selected: string | null;
  onSelect: (id: string) => void;
  ariaLabel: string;
}) {
  const vw = COLS * (W + GAP), vh = ROWS * (H + GAP);
  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" role="group" aria-label={`${ariaLabel} (schematic, not a map)`}>
      <MapPatterns />
      {REGIONS.map((r) => {
        const t = spec(r.id);
        const x = r.col * (W + GAP), y = r.row * (H + GAP);
        const label = `${r.name}: ${t.label}`;
        return (
          <g
            key={r.id}
            className={`tile${selected === r.id ? " selected" : ""}`}
            transform={`translate(${x},${y})`}
            tabIndex={0}
            role="button"
            aria-label={label}
            aria-pressed={selected === r.id}
            onClick={() => onSelect(r.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(r.id);
              }
            }}
          >
            <title>{label}</title>
            <rect className="face" width={W} height={H} rx={7} fill={t.fill} />
            <text className={t.ink === "#fff" ? "" : "halo"} x={W / 2} y={H / 2 - 3} textAnchor="middle" fill={t.ink}>{r.short}</text>
            <text className={`p num${t.ink === "#fff" ? "" : " halo"}`} x={W / 2} y={H / 2 + 13} textAnchor="middle" fill={t.ink}>{t.sub}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function TileMap({
  snapshot,
  selected,
  onSelect,
}: {
  snapshot: MapSnapshot | null;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <RegionTiles
      ariaLabel="Region confidence tiles"
      selected={selected}
      onSelect={onSelect}
      spec={(id) => {
        const m = snapshot?.regions[id];
        return {
          fill: fillFor(m),
          ink: textColor(m),
          sub: m?.status === "OK" ? pct(m.bust_prob) : m ? STATUS_SHORT[m.status] : "",
          label: m ? (m.status === "OK" ? `${m.confidence} confidence, bust probability ${pct(m.bust_prob)}` : STATUS_LABEL[m.status]) : "loading",
        };
      }}
    />
  );
}

export function MapLegend() {
  const items: [string, string][] = [
    ["HIGH  (bust < 20%)", "var(--c-high)"],
    ["MEDIUM  (20–50%)", "var(--c-medium)"],
    ["LOW  (≥ 50%)", "var(--c-low)"],
  ];
  return (
    <div className="legend">
      {items.map(([l, c]) => (
        <span className="legend-item" key={l}>
          <span className="swatch" style={{ background: c }} /> {l}
        </span>
      ))}
      <span className="legend-item">
        <svg width="14" height="14"><MapPatterns /><rect width="14" height="14" rx="3" fill="url(#hatch-noskill)" /></svg> No useful skill
      </span>
      <span className="legend-item">
        <svg width="14" height="14"><rect width="14" height="14" rx="3" fill="url(#dots-obs)" /></svg> Observation uncertain
      </span>
      <span className="legend-item">
        <span className="swatch" style={{ background: "var(--c-unavail)" }} /> Unavailable
      </span>
    </div>
  );
}

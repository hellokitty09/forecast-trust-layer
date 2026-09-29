// IMD 0.25° land cells drawn as squares on a canvas. No boundary lines - only the observation grid itself
// (hard rule 9). Cells without a value are drawn light grey, never as zero.
import { useEffect, useMemo, useRef, useState } from "react";

export interface RasterProps {
  lat: number[];
  lon: number[];
  values: (number | null)[];
  color: (v: number) => string;
  format: (v: number | null) => string;
  label: string;
  selected?: number | null;
  onSelect?: (cell: number) => void;
}

const STEP = 0.25;

export function GridRaster({ lat, lon, values, color, format, label, selected, onSelect }: RasterProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const geo = useMemo(() => {
    const la0 = Math.min(...lat), la1 = Math.max(...lat), lo0 = Math.min(...lon), lo1 = Math.max(...lon);
    const cols = Math.round((lo1 - lo0) / STEP) + 1, rows = Math.round((la1 - la0) / STEP) + 1;
    const index = new Map<string, number>();
    lat.forEach((la, i) => index.set(`${Math.round((la1 - la) / STEP)},${Math.round((lon[i]! - lo0) / STEP)}`, i));
    return { la1, lo0, cols, rows, index };
  }, [lat, lon]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const px = Math.max(2, Math.floor((c.parentElement?.clientWidth ?? 600) / geo.cols));
    const dpr = window.devicePixelRatio || 1;
    c.width = geo.cols * px * dpr;
    c.height = geo.rows * px * dpr;
    c.style.width = `${geo.cols * px}px`;
    c.style.height = `${geo.rows * px}px`;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const empty = getComputedStyle(document.documentElement).getPropertyValue("--c-unavail").trim() || "#ccc";
    lat.forEach((la, i) => {
      const r = Math.round((geo.la1 - la) / STEP), q = Math.round((lon[i]! - geo.lo0) / STEP);
      const v = values[i];
      const baseColor = v == null ? empty : color(v);
      
      // Draw pseudo-3D extruded block
      ctx.fillStyle = baseColor;
      ctx.fillRect(q * px, r * px, px - 1, px - 1);
      
      if (px > 2) {
        // Top highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(q * px, r * px, px - 1, 1);
        ctx.fillRect(q * px, r * px, 1, px - 1);
        
        // Bottom/Right shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fillRect(q * px, r * px + px - 2, px - 1, 1);
        ctx.fillRect(q * px + px - 2, r * px, 1, px - 1);
      }
    });
    if (selected != null && lat[selected] != null) {
      const r = Math.round((geo.la1 - lat[selected]!) / STEP), q = Math.round((lon[selected]! - geo.lo0) / STEP);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(q * px - 2, r * px - 2, px + 3, px + 3);
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fillRect(q * px, r * px, px - 1, px - 1);
    }
    (c as HTMLCanvasElement & { _px?: number })._px = px;
  }, [lat, lon, values, color, geo, selected]);

  const cellAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget as HTMLCanvasElement & { _px?: number };
    const px = c._px ?? 4;
    // When using CSS 3D transforms, nativeEvent.offsetX is in local untransformed coordinates!
    const q = Math.floor(e.nativeEvent.offsetX / px), r = Math.floor(e.nativeEvent.offsetY / px);
    return geo.index.get(`${r},${q}`);
  };

  return (
    <div className="raster" style={{ position: "relative" }}>
      <canvas
        ref={ref}
        role="img"
        aria-label={`${label}: grid of ${lat.length} IMD cells`}
        onMouseMove={(e) => {
          const i = cellAt(e);
          setHover(i == null ? null : { i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const i = cellAt(e);
          if (i != null) onSelect?.(i);
        }}
        style={{ cursor: onSelect ? "crosshair" : "default", display: "block" }}
      />
      {hover && (
        <div className="raster-tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          {lat[hover.i]!.toFixed(2)}°N {lon[hover.i]!.toFixed(2)}°E · <b>{format(values[hover.i] ?? null)}</b>
        </div>
      )}
    </div>
  );
}

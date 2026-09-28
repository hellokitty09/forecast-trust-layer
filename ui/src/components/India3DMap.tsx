// 3D India outline rendered via d3-geo + TopoJSON underneath the confidence tiles.
// Draws the country border with a glowing neon effect and stacked extrusion layers
// to create a holographic 3D look.
import { useEffect, useRef, useState, useMemo } from "react";
import { geoMercator, geoPath } from "d3-geo";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection } from "geojson";

import type { MapSnapshot } from "../lib/schema";

interface India3DProps {
  width?: number;
  height?: number;
  snapshot?: MapSnapshot;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
}

const STATE_TO_IMD: Record<string, string> = {
  "Andaman and Nicobar": "IMD_SUB_ANDAMAN_NICOBAR",
  "Andhra Pradesh": "IMD_SUB_COASTAL_AP",
  "Arunachal Pradesh": "IMD_SUB_ARUNACHAL",
  "Assam": "IMD_SUB_ASSAM_MEGHALAYA",
  "Bihar": "IMD_SUB_BIHAR",
  "Chandigarh": "IMD_SUB_HAR_CHD_DEL",
  "Chhattisgarh": "IMD_SUB_CHHATTISGARH",
  "Dadra and Nagar Haveli": "IMD_SUB_GUJARAT",
  "Daman and Diu": "IMD_SUB_SAURASHTRA_KUTCH",
  "Delhi": "IMD_SUB_HAR_CHD_DEL",
  "Goa": "IMD_SUB_KONKAN_GOA",
  "Gujarat": "IMD_SUB_GUJARAT",
  "Haryana": "IMD_SUB_HAR_CHD_DEL",
  "Himachal Pradesh": "IMD_SUB_HIMACHAL",
  "Jammu and Kashmir": "IMD_SUB_JK_LADAKH",
  "Jharkhand": "IMD_SUB_JHARKHAND",
  "Karnataka": "IMD_SUB_N_INT_KARNATAKA",
  "Kerala": "IMD_SUB_KERALA_MAHE",
  "Lakshadweep": "IMD_SUB_LAKSHADWEEP",
  "Madhya Pradesh": "IMD_SUB_W_MP",
  "Maharashtra": "IMD_SUB_MADHYA_MAHARASHTRA",
  "Manipur": "IMD_SUB_NMMT",
  "Meghalaya": "IMD_SUB_ASSAM_MEGHALAYA",
  "Mizoram": "IMD_SUB_NMMT",
  "Nagaland": "IMD_SUB_NMMT",
  "Orissa": "IMD_SUB_ODISHA",
  "Puducherry": "IMD_SUB_TN_PUDUCHERRY",
  "Punjab": "IMD_SUB_PUNJAB",
  "Rajasthan": "IMD_SUB_E_RAJASTHAN",
  "Sikkim": "IMD_SUB_SHWB_SIKKIM",
  "Tamil Nadu": "IMD_SUB_TN_PUDUCHERRY",
  "Tripura": "IMD_SUB_NMMT",
  "Uttar Pradesh": "IMD_SUB_E_UP",
  "Uttaranchal": "IMD_SUB_UTTARAKHAND",
  "West Bengal": "IMD_SUB_GANGETIC_WB"
};

export function India3DMap({ width = 600, height = 700, snapshot, selected, onSelect }: India3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [topo, setTopo] = useState<Topology | null>(null);

  useEffect(() => {
    fetch("/india_full.topojson")
      .then((r) => r.json())
      .then((d) => setTopo(d as Topology))
      .catch(() => {});
  }, []);

  const geojson = useMemo<FeatureCollection | null>(() => {
    if (!topo) return null;
    return topojson.feature(topo, topo.objects.india_full as GeometryCollection) as unknown as FeatureCollection;
  }, [topo]);

  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geojson) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Projection centered on India
    const projection = geoMercator()
      .center([82, 22])
      .scale(900)
      .translate([width / 2, height / 2]);

    const path = geoPath(projection, ctx);

    // --- Layer 1: Extrusion shadow layers (3D depth effect) ---
    const EXTRUDE_LAYERS = 12;
    for (let i = EXTRUDE_LAYERS; i >= 0; i--) {
      ctx.save();
      ctx.translate(0, i * 1.5);
      ctx.beginPath();
      path(geojson);
      ctx.fillStyle = `rgba(0, 255, 204, ${0.01 + (i / EXTRUDE_LAYERS) * 0.02})`;
      ctx.fill();
      if (i === EXTRUDE_LAYERS) {
        // Bottom-most layer gets a soft shadow
        ctx.shadowColor = "rgba(0, 119, 255, 0.5)";
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 10;
      }
      ctx.restore();
    }

    // Helper for region color
    const getFillStyle = (feature: any) => {
      const imdId = STATE_TO_IMD[feature.properties?.NAME_1];
      const isSelected = selected === imdId;
      const isHovered = hovered === imdId;
      
      let baseColor = "rgba(0, 255, 204, 0.06)";
      
      if (snapshot && imdId) {
        const data = snapshot.regions[imdId];
        if (data && data.status === "OK") {
           // We use the CSS var for colors, but canvas needs actual colors.
           // For now, let's use hardcoded hex/rgba for the canvas matching the CSS variables.
           // HIGH: #ff0055, MEDIUM: #ffaa00, LOW: #00ffcc
           const c = data.confidence;
           baseColor = c === "HIGH" ? "rgba(255, 0, 85, 0.4)" : 
                       c === "MEDIUM" ? "rgba(255, 170, 0, 0.4)" : "rgba(0, 255, 204, 0.4)";
        } else {
           baseColor = "rgba(100, 100, 100, 0.2)"; // Unavailable
        }
      }

      if (isSelected) {
        return baseColor.replace(/[\d.]+\)$/, "0.8)"); // Make more opaque
      }
      if (isHovered) {
        return baseColor.replace(/[\d.]+\)$/, "0.6)");
      }
      return baseColor;
    };

    // --- Layer 2: State fill (translucent glass with confidence colors) ---
    for (const feature of geojson.features) {
      ctx.beginPath();
      path(feature);
      ctx.fillStyle = getFillStyle(feature);
      ctx.fill();
    }

    // --- Layer 3: State borders (subtle internal lines) ---
    for (const feature of geojson.features) {
      ctx.beginPath();
      path(feature);
      
      const imdId = STATE_TO_IMD[feature.properties?.NAME_1];
      const isHovered = hovered === imdId;
      const isSelected = selected === imdId;
      
      ctx.strokeStyle = (isHovered || isSelected) ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 255, 204, 0.25)";
      ctx.lineWidth = (isHovered || isSelected) ? 1.5 : 0.5;
      ctx.stroke();
    }

    // --- Layer 4: Country outer glow ---
    ctx.beginPath();
    path(geojson);
    ctx.strokeStyle = "rgba(0, 255, 204, 0.15)";
    ctx.lineWidth = 8;
    ctx.stroke();

    // --- Layer 5: Country outline (bright neon) ---
    ctx.beginPath();
    path(geojson);
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#00ffcc";
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // --- Layer 6: Bright dot grid overlay for sci-fi feel ---
    // Optimize getImageData by taking one big snapshot of the canvas alpha
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = 15;
    
    ctx.beginPath();
    for (let x = 0; x < width; x += step) {
      for (let y = 0; y < height; y += step) {
        const py = Math.floor(y * dpr);
        const px = Math.floor(x * dpr);
        const alphaIndex = (py * canvas.width + px) * 4 + 3;
        
        if (imgData[alphaIndex] !== undefined && imgData[alphaIndex] > 10) {
          ctx.moveTo(x, y);
          ctx.arc(x, y, 0.8, 0, Math.PI * 2);
        }
      }
    }
    ctx.fillStyle = "rgba(0, 255, 204, 0.3)";
    ctx.fill();

  }, [geojson, width, height, snapshot, hovered, selected]);

  const handlePointer = (e: React.MouseEvent<HTMLCanvasElement>, isClick: boolean) => {
    if (!geojson || !canvasRef.current) return;
    const canvas = canvasRef.current;
    
    // Use offsetX/Y for proper positioning even with 3D transforms
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;

    // We can use a temporary path to find the feature
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d")!;
    
    // Create an offscreen path check centered around our projection
    const projection = geoMercator()
      .center([82, 22])
      .scale(900)
      .translate([width / 2, height / 2]);
      
    const path = geoPath(projection, ctx);
    
    let foundId: string | null = null;
    // Layer 0 is not translated, so the normal coordinates match exactly.
    for (const feature of geojson.features) {
      ctx.beginPath();
      path(feature);
      if (ctx.isPointInPath(x * dpr, y * dpr)) {
        foundId = STATE_TO_IMD[feature.properties?.NAME_1] ?? null;
        break;
      }
    }
    
    if (isClick && onSelect && foundId) {
       onSelect(foundId);
    } else if (!isClick) {
       setHovered(foundId);
    }
  };

  if (!topo) {
    return <div className="muted" style={{ textAlign: "center", padding: 40 }}>Loading India map...</div>;
  }

  return (
    <div className="india-3d-wrapper" style={{ position: "relative", display: "flex", justifyContent: "center" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", cursor: hovered ? "pointer" : "default" }}
        aria-label="3D map of India showing state boundaries"
        onMouseMove={(e) => handlePointer(e, false)}
        onMouseLeave={() => setHovered(null)}
        onClick={(e) => handlePointer(e, true)}
      />
    </div>
  );
}

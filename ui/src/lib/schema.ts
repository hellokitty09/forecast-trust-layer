// TrustCard + map schemas - mirror DESIGN.md §11. Anything that fails to parse
// is rendered as UNAVAILABLE (hard rule 4: never default to high confidence).
import { z } from "zod";

export const VARIABLES = ["rain", "tmax", "wind850", "wind200"] as const;
export type Variable = (typeof VARIABLES)[number];

export const VARIABLE_LABEL: Record<Variable, string> = {
  rain: "Rainfall",
  tmax: "Max temperature",
  wind850: "Wind 850 hPa",
  wind200: "Wind 200 hPa",
};

export const STATUSES = ["OK", "UNAVAILABLE", "NO_SKILL", "OBS_UNCERTAIN"] as const;
export type Status = (typeof STATUSES)[number];
export const CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

const prob = z.number().min(0).max(1);

export const TrustCardSchema = z.object({
  card_id: z.string().min(1),
  schema_version: z.string(),
  init_time: z.string(),
  valid_date: z.string(),
  lead_day: z.number().int().min(1).max(10),
  region_id: z.string().min(1),
  variable: z.enum(VARIABLES),
  status: z.enum(STATUSES),
  skill_horizon_day: z.number().int().min(0).max(10).nullable().optional(),
  bust_prob: prob.nullable().optional(),
  bust_prob_interval: z.tuple([prob, prob]).nullable().optional(),
  confidence: z.enum(CONFIDENCES).nullable().optional(),
  expected_error_mm: z.object({ q10: z.number(), q50: z.number(), q90: z.number() }).nullable().optional(),
  expected_error: z
    .object({ unit: z.string(), q10: z.number(), q50: z.number(), q90: z.number() })
    .nullable()
    .optional(),
  heavy_rain: z.object({ p_miss: prob, p_false_alarm: prob }).nullable().optional(),
  anatomy: z.object({ bias: prob, start: prob, chaos: prob }).nullable().optional(),
  systems: z.array(z.string()).default([]),
  reasons: z.array(z.string()).default([]),
  novelty: z.object({ score: z.number(), unprecedented: z.boolean() }).nullable().optional(),
  obs_certainty: z.enum(["HIGH", "MEDIUM", "LOW"]).nullable().optional(),
  analog_ids: z.array(z.string()).default([]),
  model: z.object({ version: z.string(), sha256: z.string() }),
  inputs: z.object({ source: z.string(), sha256: z.string() }),
  illustrative: z.boolean().default(false),
  // schema 1.1 - Live Bust Watch: when this version was issued and what it replaced
  issued_at: z.string().nullable().optional(),
  supersedes: z.string().nullable().optional(),
  update_reason: z.string().nullable().optional(),
  prev_hash: z.string().optional(),
  signature: z.string().optional(),
});
export type TrustCard = z.infer<typeof TrustCardSchema>;

export const MapFeaturePropsSchema = z.object({
  region_id: z.string(),
  status: z.enum(STATUSES),
  confidence: z.enum(CONFIDENCES).nullable().optional(),
  bust_prob: prob.nullable().optional(),
  illustrative: z.boolean().default(false),
});
export type MapRegion = z.infer<typeof MapFeaturePropsSchema>;

export interface MapSnapshot {
  init_time: string;
  lead_day: number;
  variable: Variable;
  regions: Record<string, MapRegion>;
  illustrative: boolean;
  source: "api" | "offline-bundle" | "illustrative";
}

export const AnalogSchema = z.object({
  date: z.string(),
  system: z.string().optional(),
  outcome: z.string(),
  distance: z.number().optional(),
  busted: z.boolean().nullable().optional(),
  illustrative: z.boolean().default(false),
});
export type Analog = z.infer<typeof AnalogSchema>;

/** Fail-safe: out-of-range or missing fields → UNAVAILABLE, never HIGH. */
export function parseCard(raw: unknown): { ok: true; card: TrustCard } | { ok: false; error: string } {
  const r = TrustCardSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const card = { ...r.data };
  if (card.status !== "OK") return { ok: true, card: { ...card, confidence: null } };
  // An OK card must carry a probability; if it doesn't, downgrade.
  if (card.bust_prob == null || card.confidence == null) {
    return { ok: true, card: { ...card, status: "UNAVAILABLE", confidence: null } };
  }
  // Server and configured bands disagree → show the more cautious band.
  card.confidence = mostCautious(card.confidence, confidenceFor(card.bust_prob));
  // DESIGN §9: unprecedented pattern caps confidence at LOW.
  if (card.novelty?.unprecedented) card.confidence = "LOW";
  return { ok: true, card };
}

const CAUTION_ORDER: Confidence[] = ["LOW", "MEDIUM", "HIGH"];
export function mostCautious(a: Confidence, b: Confidence): Confidence {
  return CAUTION_ORDER[Math.min(CAUTION_ORDER.indexOf(a), CAUTION_ORDER.indexOf(b))]!;
}

/** DESIGN §11 confidence bands: HIGH < 0.2 ≤ MEDIUM < 0.5 ≤ LOW (bust_prob). */
export const CONFIDENCE_BANDS = { mediumFrom: 0.2, lowFrom: 0.5 } as const;
export function confidenceFor(p: number): Confidence {
  if (p >= CONFIDENCE_BANDS.lowFrom) return "LOW";
  if (p >= CONFIDENCE_BANDS.mediumFrom) return "MEDIUM";
  return "HIGH";
}

export function parseMapRegion(raw: unknown): MapRegion | null {
  const r = MapFeaturePropsSchema.safeParse(raw);
  if (!r.success) return null;
  const m = r.data;
  if (m.status !== "OK") return { ...m, confidence: null };
  if (m.bust_prob == null || m.confidence == null) return { ...m, status: "UNAVAILABLE", confidence: null };
  return { ...m, confidence: mostCautious(m.confidence, confidenceFor(m.bust_prob)) };
}

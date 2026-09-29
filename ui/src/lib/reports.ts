// Schemas for validation-pack reports written by `make eval` (DESIGN §10). Bias, skill and scorecard
// come from /v1/bias and /v1/scorecard; replay still comes from static files in ui/public/reports/.
// The UI renders only what these contain - it never computes or fills in a metric (hard rule 1).
import { z } from "zod";

const meta = {
  generated_at: z.string(),
  source: z.string(), // forecast data, e.g. "GEFSv12 reforecast 2000–2019"
  truth: z.string(), // verifying observations, e.g. "IMD 0.25° gridded rain" - always shown
  illustrative: z.boolean().default(false),
};

/** reports/m0/bias_map.json - DESIGN §7.1 error-prone area map. */
export const BiasMapSchema = z.object({
  ...meta,
  variable: z.string(),
  unit: z.string(),
  season: z.string(),
  lead_days: z.array(z.number().int()),
  /** region_id → mean error (forecast − obs) per lead in `lead_days` order; null = insufficient data */
  regions: z.record(z.string(), z.array(z.number().nullable())),
});
export type BiasMap = z.infer<typeof BiasMapSchema>;

/** reports/m0/skill_horizon.json - DESIGN §7.4 / model A. */
export const SkillHorizonSchema = z.object({
  ...meta,
  variable: z.string(),
  metric: z.string(), // e.g. "SEEPS skill vs climatology"
  lead_days: z.array(z.number().int()),
  regions: z.record(
    z.string(),
    z.object({
      skill: z.array(z.number().nullable()),
      lower: z.array(z.number().nullable()), // bootstrap lower bound
      horizon_day: z.number().int().nullable(),
    }),
  ),
});
export type SkillHorizon = z.infer<typeof SkillHorizonSchema>;

/** reports/scorecard.json - DESIGN §10. */
export const ScorecardSchema = z.object({
  ...meta,
  split: z.string(),
  rows: z.array(
    z.object({
      variable: z.string(),
      lead_band: z.string(),
      system: z.string().nullable(),
      model: z.string(), // "FTL" | "climatology" | "lead-only" | "ensemble spread (calibrated)"
      n_events: z.number().int(),
      bss: z.number().nullable(),
      bss_ci: z.tuple([z.number(), z.number()]).nullable(),
      auroc: z.number().nullable(),
      auroc_ci: z.tuple([z.number(), z.number()]).nullable(),
      pr_auc: z.number().nullable().optional(),
      coverage90: z.number().nullable().optional(),
      lift: z.number().nullable().optional(), // bust rate in flagged region-days ÷ overall bust rate
      indicative: z.boolean(), // computed by the server from n_events
    }),
  ),
  reliability: z
    .record(z.string(), z.array(z.tuple([z.number(), z.number(), z.number().int()]))) // model → [p_forecast, obs_freq, n]
    .nullable()
    .optional(),
});
export type Scorecard = z.infer<typeof ScorecardSchema>;

/** GET /v1/bias response. */
export const BiasResponseSchema = z.object({
  variable: z.string(),
  season: z.string(),
  lead: z.number().int().nullable(),
  bias: BiasMapSchema.nullable(),
  skill_horizon: SkillHorizonSchema.nullable(),
  status: z.enum(["OK", "PARTIAL", "NOT_GENERATED"]),
});
export type BiasResponse = z.infer<typeof BiasResponseSchema>;

/** GET /v1/bias/grid - M0 grid-level bias + SEEPS skill on IMD land cells. */
const nums = z.array(z.number().nullable());
export const GridReportSchema = z.object({
  ...meta,
  variable: z.string(),
  unit: z.string(),
  season: z.string(),
  months: z.array(z.number().int()),
  eval_years: z.array(z.number().int()),
  metric: z.string(),
  ci: z.number(),
  n_inits: z.number().int(),
  lead_days: z.array(z.number().int()),
  cells: z.object({ lat: z.array(z.number()), lon: z.array(z.number()) }),
  bias: z.array(nums),
  n: z.array(z.array(z.number().int())),
  skill: z.array(nums),
  skill_lower: z.array(nums),
  skill_upper: z.array(nums),
  horizon_day: z.array(z.number().int().nullable()),
  all_india: z.object({
    lead_days: z.array(z.number().int()),
    skill: nums,
    lower: nums,
    upper: nums,
    horizon_day: z.number().int().nullable(),
  }),
});
export type GridReport = z.infer<typeof GridReportSchema>;

export const SEASONS = ["pre_monsoon", "monsoon", "post_monsoon", "winter"] as const;
export const SEASON_LABEL: Record<(typeof SEASONS)[number], string> = {
  pre_monsoon: "Pre-monsoon",
  monsoon: "Monsoon (onset-relative)",
  post_monsoon: "Post-monsoon",
  winter: "Winter",
};

/** reports/replay/index.json + reports/replay/<init>.json - DESIGN §12.4. */
export const ReplayIndexSchema = z.object({
  cases: z.array(z.object({ init_time: z.string(), variable: z.string(), title: z.string(), file: z.string() })),
});
export const ReplayCaseSchema = z.object({
  ...meta,
  init_time: z.string(),
  variable: z.string(),
  title: z.string(),
  description: z.string().optional(),
  /** lead day → region_id → map props (same shape as /v1/map features) */
  leads: z.record(z.string(), z.record(z.string(), z.unknown())),
  /** lead day → region_id → did a bust actually happen? null = obs uncertain */
  truth: z.record(z.string(), z.record(z.string(), z.boolean().nullable())),
});
export type ReplayCase = z.infer<typeof ReplayCaseSchema>;

export const INDICATIVE_BELOW = 30; // DESIGN §10: "indicative" if < 30 events

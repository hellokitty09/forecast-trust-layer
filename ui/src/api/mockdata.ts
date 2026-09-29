// Mock data engine for the Forecast Trust Layer hackathon prototype.
// Produces varied, clearly labeled illustrative values per region × variable × lead.
// No backend needed - everything runs client-side.
import { REGIONS } from "../lib/regions";
import { confidenceFor, type MapSnapshot, type TrustCard, type Variable, type Analog } from "../lib/schema";
import type { BiasResponse } from "../lib/reports";
import type { Health, ChainStatus, Alerts, VerifyResult } from "./client";

// ── Deterministic pseudo-random from string seed ──
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function hashRange(seed: string, min: number, max: number): number {
  return +(min + hash01(seed) * (max - min)).toFixed(2);
}

// ── Meteorological reason banks ──
const REASONS: Record<Variable, string[]> = {
  rain: [
    "LPS track spread over central India - ensemble members diverge on landfall position",
    "BSISO entering break phase - monsoon trough retreating northward",
    "Moisture convergence over Western Ghats highly sensitive to SST forcing",
    "Uncertainty in mid-tropospheric vortex position over Bay of Bengal",
    "Run-to-run flip in cross-equatorial flow intensity",
  ],
  tmax: [
    "WD arrival timing uncertain over J&K - ±24h spread in ensemble",
    "Soil-moisture feedback amplifying surface temperature uncertainty",
    "Run-to-run jump in 850 hPa temperature advection",
    "Anti-cyclonic subsidence strength uncertain over Rajasthan",
    "Urban heat island signal not resolved at model grid spacing",
  ],
  wind850: [
    "Somali Jet strength uncertain - linked to Indian Ocean dipole phase",
    "LPS track spread affecting low-level convergence patterns",
    "Monsoon onset surge timing varies by 36h across ensemble",
    "Cross-equatorial flow modulation by MJO phase 2-3 transition",
  ],
  wind200: [
    "200 hPa Tropical Easterly Jet position uncertain ±2° latitude",
    "WD trough timing and amplitude show bimodal ensemble distribution",
    "Subtropical westerly jet interaction with tropical easterlies",
    "ENSO teleconnection signal weakening at extended leads",
  ],
};

const SYSTEMS: Record<Variable, string[]> = {
  rain: ["MONSOON_LPS", "WD_TROUGH", "MONSOON_TROUGH", "MJO_CONVECTION"],
  tmax: ["HEAT_WAVE", "WD_TROUGH", "ANTI_CYCLONE"],
  wind850: ["MONSOON_LPS", "SOMALI_JET", "CROSS_EQ_FLOW"],
  wind200: ["TEJ", "WD_TROUGH", "STJ"],
};

// ── Region-specific bust probabilities (varied, realistic) ──
function bustProb(regionId: string, variable: Variable, lead: number): number {
  // Base varies per region, increases with lead, differs by variable
  const regionBase = hash01(`bp|${regionId}|${variable}`) * 0.35 + 0.08;
  const leadFactor = lead * 0.04;
  const noise = hash01(`bp|${regionId}|${variable}|${lead}`) * 0.15;
  return Math.min(0.95, Math.max(0.05, regionBase + leadFactor + noise));
}

function skillHorizon(regionId: string, variable: Variable): number {
  return Math.round(4 + hash01(`sh|${regionId}|${variable}`) * 4); // 4–8
}

// ── Map snapshot ──
export function mockMap(init: string, lead: number, variable: Variable): MapSnapshot {
  const regions: MapSnapshot["regions"] = {};
  for (const r of REGIONS) {
    const horizon = skillHorizon(r.id, variable);
    if (lead > horizon) {
      regions[r.id] = { region_id: r.id, status: "NO_SKILL", confidence: null, bust_prob: null, illustrative: true };
    } else {
      const p = Math.round(bustProb(r.id, variable, lead) * 100) / 100;
      regions[r.id] = { region_id: r.id, status: "OK", confidence: confidenceFor(p), bust_prob: p, illustrative: true };
    }
  }
  return { init_time: init, lead_day: lead, variable, regions, illustrative: true, source: "illustrative" };
}

// ── Trust card ──
export function mockCard(init: string, lead: number, variable: Variable, regionId: string): TrustCard {
  const p = bustProb(regionId, variable, lead);
  const initDate = new Date(init);
  const valid = new Date(initDate.getTime() + lead * 86400000).toISOString().slice(0, 10);
  const unit = variable === "rain" ? "mm" : variable === "tmax" ? "°C" : "m/s";
  const errScale = variable === "rain" ? 12 : variable === "tmax" ? 1.4 : 3;

  const bias = hashRange(`an|${regionId}|bias`, 0.12, 0.45);
  const start = hashRange(`an|${regionId}|start|${lead}`, 0.08, 0.30);
  const chaos = Math.max(0.05, +(1 - bias - start).toFixed(2));

  const reasonPool = REASONS[variable];
  const r1 = Math.floor(hash01(`r1|${regionId}|${variable}`) * reasonPool.length);
  const r2 = (r1 + 1 + Math.floor(hash01(`r2|${regionId}|${variable}`) * (reasonPool.length - 1))) % reasonPool.length;

  const sysPool = SYSTEMS[variable];
  const s1 = Math.floor(hash01(`sys|${regionId}`) * sysPool.length);

  const horizon = skillHorizon(regionId, variable);

  return {
    card_id: `ftl-${regionId}-${variable}-${lead}-${init.slice(0,10)}`,
    schema_version: "1.0",
    init_time: init,
    valid_date: valid,
    lead_day: lead,
    region_id: regionId,
    variable,
    status: "OK",
    skill_horizon_day: horizon,
    bust_prob: +p.toFixed(2),
    bust_prob_interval: [Math.max(0, +(p - 0.12 - hash01(`ci|${regionId}`) * 0.06).toFixed(2)), Math.min(1, +(p + 0.12 + hash01(`ci2|${regionId}`) * 0.06).toFixed(2))],
    confidence: confidenceFor(p),
    expected_error: {
      unit,
      q10: +(errScale * (0.2 + p * 0.3)).toFixed(1),
      q50: +(errScale * (0.6 + p * 0.8)).toFixed(1),
      q90: +(errScale * (1.2 + p * 2.0)).toFixed(1),
    },
    heavy_rain: variable === "rain" ? {
      p_miss: +(p * hashRange(`miss|${regionId}`, 0.4, 0.7)).toFixed(2),
      p_false_alarm: +hashRange(`fa|${regionId}`, 0.08, 0.22).toFixed(2),
    } : null,
    anatomy: { bias, start, chaos },
    systems: [sysPool[s1]!],
    reasons: [reasonPool[r1]!, reasonPool[r2]!],
    novelty: { score: +hashRange(`nov|${regionId}`, 0.05, 0.55).toFixed(2), unprecedented: false },
    obs_certainty: "HIGH",
    analog_ids: [],
    model: { version: "preview-only", sha256: "not-computed" },
    inputs: { source: "Generated preview scenario - no verified forecast or observation input", sha256: "not-computed" },
    illustrative: true,
    signature: undefined,
    prev_hash: "not-linked-preview-card",
    issued_at: init,
  };
}

// ── Illustrative analog-search examples; these are not historical events ──
const ANALOG_BANK: Record<Variable, Analog[]> = {
  rain: [
    { date: "Scenario A", system: "Monsoon low-pressure system", outcome: "The rain corridor shifts east of the initial guidance as model runs diverge on the track.", busted: true, illustrative: true },
    { date: "Scenario B", system: "Western disturbance", outcome: "The heaviest rain arrives a day later than the first scenario forecast.", busted: true, illustrative: true },
  ],
  tmax: [
    { date: "Scenario A", system: "Heat wave onset", outcome: "Hot conditions begin earlier and cover a wider area than the first scenario forecast.", busted: true, illustrative: true },
    { date: "Scenario B", system: "Persistent hot spell", outcome: "The forecast captures the peak day but misses the local temperature maximum.", busted: true, illustrative: true },
  ],
  wind850: [
    { date: "Scenario A", system: "Monsoon low-pressure system", outcome: "The low-level convergence zone forms farther east than the first scenario forecast.", busted: true, illustrative: true },
    { date: "Scenario B", system: "Monsoon flow transition", outcome: "The cross-equatorial flow strengthens one cycle later than expected.", busted: true, illustrative: true },
  ],
  wind200: [
    { date: "Scenario A", system: "Tropical easterly jet", outcome: "The jet core is displaced north of the first scenario forecast.", busted: true, illustrative: true },
    { date: "Scenario B", system: "Subtropical westerly trough", outcome: "The trough arrives earlier than the first scenario forecast.", busted: true, illustrative: true },
  ],
};

export function mockAnalogs(variable: Variable, regionId: string): Analog[] {
  const pool = ANALOG_BANK[variable];
  const n = Math.min(2, pool.length);
  const start = Math.floor(hash01(`anas|${regionId}`) * pool.length);
  const result: Analog[] = [];
  for (let i = 0; i < n; i++) result.push(pool[(start + i) % pool.length]!);
  return result;
}

// ── Live Bust Watch (history) ──
export function mockHistory(init: string, lead: number, variable: Variable, regionId: string): TrustCard[] {
  const current = mockCard(init, lead, variable, regionId);
  const p = current.bust_prob ?? 0.5;
  const v1: TrustCard = {
    ...current,
    card_id: current.card_id + "-v1",
    confidence: confidenceFor(Math.min(0.95, p + 0.15)),
    bust_prob: +Math.min(0.95, p + 0.15).toFixed(2),
    issued_at: new Date(new Date(init).getTime() - 12 * 3600000).toISOString(),
    update_reason: "Example update: model runs show a wider range",
  };
  const v2: TrustCard = {
    ...current,
    card_id: current.card_id + "-v2",
    confidence: confidenceFor(Math.min(0.95, p + 0.06)),
    bust_prob: +Math.min(0.95, p + 0.06).toFixed(2),
    issued_at: new Date(new Date(init).getTime() - 6 * 3600000).toISOString(),
    update_reason: "Example update: model-run spread narrows",
  };
  current.update_reason = "Current example card";
  return [v1, v2, current];
}

// ── Health check ──
export function mockHealth(): Health {
  return {
    status: "ok",
    data_freshness: new Date().toISOString(),
    model_version: "FTL-v0.9.2-monsoon",
  };
}

// ── Chain status (Forecast Black Box) ──
export function mockChain(): ChainStatus {
  return {
    cards_in_chain: 14287,
    head_hash: "sha256:a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
    chain_intact: true,
    chain_detail: "All 14,287 cards link correctly. No missing or reordered entries detected.",
    cards_rejected: 0,
    audit_intact: true,
    audit_detail: "Append-only audit log intact. 14,287 entries verified, 0 anomalies.",
  };
}

// ── Public keys ──
export function mockKeys() {
  return [
    {
      key_id: "ftl-prod-2026-09",
      alg: "Ed25519",
      public_key: "MCowBQYDK2VwAyEA9LYkB3hVCm8p4t7q2z1x5w6nM0rOeK3fS2hA7jDvXYk=",
      current: true,
    },
    {
      key_id: "ftl-prod-2026-06",
      alg: "Ed25519",
      public_key: "MCowBQYDK2VwAyEAk5M3rT8wZ1xQ9yH7aB2cD4eF6gI8jL0mN2oP4qR6sT8=",
      current: false,
    },
  ];
}

// ── Verify card (mock) ──
export function mockVerify(_card: unknown): Promise<VerifyResult> {
  return new Promise(resolve =>
    setTimeout(() => resolve({ valid: true, signature_valid: true, chain_valid: true, detail: "Ed25519 signature verified. Hash chain position confirmed." }), 600)
  );
}

// ── Alerts ──
export function mockAlerts(init: string, leadMin: number, threshold: number): Alerts {
  const alerts: Alerts["alerts"] = [];
  const variables: Variable[] = ["rain", "tmax", "wind850", "wind200"];
  for (const v of variables) {
    for (let lead = leadMin; lead <= 10; lead++) {
      const m = mockMap(init, lead, v);
      for (const r of REGIONS) {
        const c = m.regions[r.id]!;
        if (c.status !== "OK" || c.bust_prob == null || !c.confidence) continue;
        if (c.bust_prob >= threshold || c.confidence === "LOW") {
          const reasonPool = REASONS[v];
          const ri = Math.floor(hash01(`ar|${r.id}|${v}|${lead}`) * reasonPool.length);
          alerts.push({
            card_id: `ftl-${r.id}-${v}-${lead}`,
            region_id: r.id,
            region_name: r.name,
            variable: v,
            lead_day: lead,
            bust_prob: c.bust_prob,
            confidence: c.confidence!,
            reasons: [reasonPool[ri]!],
            illustrative: true,
          });
        }
      }
    }
  }
  alerts.sort((a, b) => b.bust_prob - a.bust_prob || a.lead_day - b.lead_day);
  return { init_time: init, threshold, lead_min: leadMin, alerts: alerts.slice(0, 50), unavailable: 0 };
}

// ── Bias response ──
export function mockBias(variable: Variable, season: string): BiasResponse {
  const leadDays = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const biasRegions: Record<string, (number | null)[]> = {};
  const skillRegions: Record<string, { skill: (number | null)[]; lower: (number | null)[]; horizon_day: number | null }> = {};

  for (const r of REGIONS) {
    const biasArr: (number | null)[] = [];
    const skillArr: (number | null)[] = [];
    const lowerArr: (number | null)[] = [];
    const horizon = skillHorizon(r.id, variable);

    for (const ld of leadDays) {
      const b = hashRange(`bias|${r.id}|${variable}|${ld}|${season}`, -8, 8);
      biasArr.push(ld <= horizon ? b : null);
      const sk = Math.max(-0.2, hashRange(`sk|${r.id}|${variable}|${ld}`, 0.1, 0.8) - ld * 0.06);
      skillArr.push(+sk.toFixed(3));
      lowerArr.push(+(sk - 0.08 - hash01(`skl|${r.id}|${ld}`) * 0.05).toFixed(3));
    }
    biasRegions[r.id] = biasArr;
    skillRegions[r.id] = { skill: skillArr, lower: lowerArr, horizon_day: horizon };
  }

  const unit = variable === "rain" ? "mm" : variable === "tmax" ? "°C" : "m/s";
  return {
    variable,
    season,
    lead: null,
    bias: {
      generated_at: "2026-09-27T18:00:00Z",
      source: "Generated preview values - no verified forecast archive",
      truth: "No verified observation comparison",
      illustrative: true,
      variable,
      unit,
      season,
      lead_days: leadDays,
      regions: biasRegions,
    },
    skill_horizon: {
      generated_at: "2026-09-27T18:00:00Z",
      source: "Generated preview values - no verified forecast archive",
      truth: "No verified observation comparison",
      illustrative: true,
      variable,
      metric: "SEEPS skill vs climatology",
      lead_days: leadDays,
      regions: skillRegions,
    },
    status: "OK",
  };
}

// ── Scorecard ──
export function mockScorecard() {
  const rows = [];
  const variables = ["rain", "tmax", "wind850"];
  const bands = ["Day 1-3", "Day 4-6", "Day 7-10"];
  const models = ["FTL", "ensemble spread (calibrated)", "climatology"];

  for (const v of variables) {
    for (const band of bands) {
      for (const model of models) {
        const baseSkill = model === "FTL" ? 0.35 : model === "ensemble spread (calibrated)" ? 0.18 : 0;
        const bandPenalty = band === "Day 1-3" ? 0 : band === "Day 4-6" ? 0.08 : 0.18;
        const bss = +(baseSkill - bandPenalty + hashRange(`sc|${v}|${band}|${model}`, -0.05, 0.05)).toFixed(3);
        const auroc = model === "climatology" ? 0.5 : +(0.6 + baseSkill + hashRange(`auc|${v}|${band}|${model}`, -0.05, 0.08) - bandPenalty).toFixed(3);
        const nEvents = Math.round(120 + hash01(`ne|${v}|${band}`) * 400);
        rows.push({
          variable: v,
          lead_band: band,
          system: null,
          model,
          n_events: nEvents,
          bss: Math.max(-0.1, bss),
          bss_ci: [Math.max(-0.2, bss - 0.04), bss + 0.04] as [number, number],
          auroc: Math.min(0.98, Math.max(0.45, auroc)),
          auroc_ci: [Math.max(0.4, auroc - 0.03), Math.min(1, auroc + 0.03)] as [number, number],
          pr_auc: model === "climatology" ? null : +Math.max(0.15, auroc - 0.15).toFixed(3),
          coverage90: model === "climatology" ? null : +hashRange(`cov|${v}|${band}|${model}`, 0.82, 0.96).toFixed(2),
          lift: model === "FTL" ? +hashRange(`lift|${v}|${band}`, 1.8, 3.5).toFixed(1) : null,
          indicative: nEvents < 30,
        });
      }
    }
  }

  return {
    generated_at: "2026-09-27T18:00:00Z",
    source: "Generated preview values - no verified forecast archive",
    truth: "No verified observation comparison",
    illustrative: true,
    split: "No validation split - generated interface preview",
    rows,
    reliability: {
      FTL: [[0.1, 0.08, 85], [0.2, 0.18, 120], [0.3, 0.27, 95], [0.4, 0.38, 78], [0.5, 0.52, 64], [0.6, 0.58, 45], [0.7, 0.72, 32], [0.8, 0.83, 18], [0.9, 0.91, 8]] as [number, number, number][],
      "ensemble spread (calibrated)": [[0.1, 0.12, 90], [0.2, 0.22, 100], [0.3, 0.35, 80], [0.4, 0.48, 60], [0.5, 0.55, 50], [0.6, 0.63, 35], [0.7, 0.68, 25], [0.8, 0.75, 15]] as [number, number, number][],
    },
  };
}

// ── Replay cases ──
export function mockReplayIndex() {
  return {
    cases: [
      { init_time: "2018-08-08T00:00:00Z", variable: "rain", title: "Preview · Monsoon rainfall scenario A", file: "kerala-2018.json" },
      { init_time: "2023-07-09T00:00:00Z", variable: "rain", title: "Preview · Northern plains rainfall scenario B", file: "delhi-2023.json" },
      { init_time: "2024-05-25T00:00:00Z", variable: "tmax", title: "Preview · Hot-day forecast scenario C", file: "rajasthan-heat-2024.json" },
    ],
  };
}

export function mockReplayCase(file: string) {
  const defaultCfg = { init: "2018-08-08T00:00:00Z", variable: "rain" as Variable, title: "Preview · Monsoon rainfall scenario A", desc: "Generated interface scenario showing how a forecaster could review changing rainfall confidence across lead days." };
  const configMap: Record<string, typeof defaultCfg> = {
    "kerala-2018.json": defaultCfg,
    "delhi-2023.json": { init: "2023-07-09T00:00:00Z", variable: "rain", title: "Preview · Northern plains rainfall scenario B", desc: "Generated interface scenario for inspecting a high-risk rainfall pattern. It is not a verified event replay." },
    "rajasthan-heat-2024.json": { init: "2024-05-25T00:00:00Z", variable: "tmax", title: "Preview · Hot-day forecast scenario C", desc: "Generated interface scenario for the maximum-temperature workflow. It is not a verified heat-wave replay." },
  };
  const cfg = configMap[file] ?? defaultCfg;

  const leadsData: Record<string, Record<string, unknown>> = {};
  const truthData: Record<string, Record<string, boolean | null>> = {};
  for (let lead = 1; lead <= 10; lead++) {
    leadsData[String(lead)] = {};
    truthData[String(lead)] = {};
    for (const r of REGIONS) {
      const p = bustProb(r.id, cfg.variable, lead);
      leadsData[String(lead)]![r.id] = {
        region_id: r.id,
        status: lead <= skillHorizon(r.id, cfg.variable) ? "OK" : "NO_SKILL",
        confidence: confidenceFor(p),
        bust_prob: +p.toFixed(2),
        illustrative: true,
      };
      const didBust = hash01(`truth|${r.id}|${cfg.variable}|${lead}`) > 0.55;
      truthData[String(lead)]![r.id] = p > 0.6 ? didBust : p > 0.3 ? !didBust : false;
    }
  }

  // Build object avoiding duplicate key: the schema has both `truth` (string metadata)
  // and `truth` (lead→region→boolean) but JS objects can't have duplicates.
  // ReplayCaseSchema declares `truth` as the latter. We place the metadata string in `source`.
  const result: Record<string, unknown> = {
    generated_at: "2026-09-27T18:00:00Z",
    source: "Generated preview scenario - not a historical forecast replay",
    truth: truthData,
    illustrative: true,
    init_time: cfg.init,
    variable: cfg.variable,
    title: cfg.title,
    description: cfg.desc,
    leads: leadsData,
  };
  return result;
}

// ── CAP XML mock ──
export function mockCapXml(cardId: string): Blob {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>${cardId}</identifier>
  <sender>FTL-SIH26079</sender>
  <sent>${new Date().toISOString()}</sent>
  <status>Exercise</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <info>
    <category>Met</category>
    <event>Low Forecast Confidence</event>
    <urgency>Expected</urgency>
    <severity>Moderate</severity>
    <certainty>Likely</certainty>
    <headline>Forecast Trust Layer - Low confidence alert</headline>
    <description>The FTL system has flagged this region-day with elevated bust probability. Forecasters should review the Trust Card for error anatomy details.</description>
  </info>
</alert>`;
  return new Blob([xml], { type: "application/xml" });
}

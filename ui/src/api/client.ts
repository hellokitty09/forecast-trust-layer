// API client for the FTL prototype.
// In hackathon mode, all calls are served by the mock data engine.
// No backend needed — everything runs client-side with realistic simulated data.
import {
  parseCard,
  type Analog,
  type MapSnapshot,
  type TrustCard,
  type Variable,
} from "../lib/schema";
import { z } from "zod";
import { ScorecardSchema, type GridReport, type Scorecard } from "../lib/reports";
import {
  mockMap,
  mockCard,
  mockAnalogs,
  mockHistory,
  mockHealth,
  mockChain,
  mockKeys,
  mockVerify,
  mockAlerts,
  mockBias,
  mockScorecard,
  mockReplayIndex,
  mockReplayCase,
  mockCapXml,
} from "./mockdata";

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const TOKEN_KEY = "ftl.token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string | null): void {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export interface Health {
  status: string;
  data_freshness?: string;
  model_version?: string;
}

export async function getHealth(): Promise<Health> {
  // Simulate a brief network delay
  await new Promise(r => setTimeout(r, 150));
  return mockHealth();
}

export async function getMap(init: string, lead: number, variable: Variable): Promise<MapSnapshot> {
  await new Promise(r => setTimeout(r, 200));
  return mockMap(init, lead, variable);
}

export async function getOfflineMap(lead: number, variable: Variable): Promise<MapSnapshot> {
  return mockMap(new Date().toISOString(), lead, variable);
}

export type CardResult = { card: TrustCard; raw: unknown } | { card: null; error: string; raw: unknown };

export async function getTrustCard(init: string, lead: number, region: string, variable: Variable): Promise<CardResult> {
  await new Promise(r => setTimeout(r, 100));
  const raw = mockCard(init, lead, variable, region);
  const p = parseCard(raw);
  return p.ok ? { card: p.card, raw } : { card: null, error: p.error, raw };
}

export async function getCases(cardId: string, variable?: Variable, regionId?: string): Promise<Analog[]> {
  await new Promise(r => setTimeout(r, 150));
  return mockAnalogs(variable ?? "rain", regionId ?? cardId);
}

export async function getCap(cardId: string): Promise<Blob> {
  await new Promise(r => setTimeout(r, 100));
  return mockCapXml(cardId);
}

export interface VerifyResult {
  valid: boolean;
  signature_valid?: boolean;
  chain_valid?: boolean;
  detail?: string;
}

export async function verifyCard(card: unknown): Promise<VerifyResult> {
  return mockVerify(card);
}

export async function getBias(variable: Variable, season: string) {
  await new Promise(r => setTimeout(r, 300));
  return mockBias(variable, season);
}

export async function getBiasGrid(_variable: Variable, _season: string): Promise<GridReport> {
  // Grid report: return 404-like error so the page gracefully shows subdivision tiles only
  throw new ApiError("not generated", 404);
}

export async function getScorecard(): Promise<Scorecard> {
  await new Promise(r => setTimeout(r, 250));
  return ScorecardSchema.parse(mockScorecard());
}

export async function getHistory(init: string, lead: number, region: string, variable: Variable): Promise<TrustCard[]> {
  await new Promise(r => setTimeout(r, 200));
  return mockHistory(init, lead, variable, region);
}

export const ChainStatusSchema = z.object({
  cards_in_chain: z.number().int(),
  head_hash: z.string(),
  chain_intact: z.boolean(),
  chain_detail: z.string(),
  cards_rejected: z.number().int(),
  audit_intact: z.boolean(),
  audit_detail: z.string(),
});
export type ChainStatus = z.infer<typeof ChainStatusSchema>;

export async function getChain(): Promise<ChainStatus> {
  await new Promise(r => setTimeout(r, 200));
  return mockChain();
}

export const PublicKeySchema = z.object({ key_id: z.string(), alg: z.string(), public_key: z.string(), current: z.boolean() });
export async function getKeys(): Promise<z.infer<typeof PublicKeySchema>[]> {
  await new Promise(r => setTimeout(r, 100));
  return mockKeys();
}

export const AlertSchema = z.object({
  card_id: z.string(),
  region_id: z.string(),
  region_name: z.string().nullable(),
  variable: z.enum(["rain", "tmax", "wind850", "wind200"]),
  lead_day: z.number().int(),
  bust_prob: z.number().min(0).max(1),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reasons: z.array(z.string()),
  illustrative: z.boolean(),
});
export const AlertsSchema = z.object({
  init_time: z.string(),
  threshold: z.number(),
  lead_min: z.number().int(),
  alerts: z.array(AlertSchema),
  unavailable: z.number().int(),
});
export type Alerts = z.infer<typeof AlertsSchema>;

export async function getAlerts(init: string, leadMin: number, threshold: number): Promise<Alerts> {
  await new Promise(r => setTimeout(r, 200));
  return mockAlerts(init, leadMin, threshold);
}

/** Static validation-pack files (replay). */
export async function getReport<T>(name: string): Promise<T> {
  await new Promise(r => setTimeout(r, 150));
  if (name === "replay/index.json") return mockReplayIndex() as T;
  // Extract filename from path
  const file = name.replace("replay/", "");
  return mockReplayCase(file) as T;
}

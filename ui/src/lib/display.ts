import type { Confidence, Status } from "./schema";

export const CONF_COLOR: Record<Confidence, string> = {
  HIGH: "var(--c-high)",
  MEDIUM: "var(--c-medium)",
  LOW: "var(--c-low)",
};

export const STATUS_LABEL: Record<Status, string> = {
  OK: "OK",
  UNAVAILABLE: "Unavailable",
  NO_SKILL: "No useful skill",
  OBS_UNCERTAIN: "Observation uncertain",
};

export const STATUS_SHORT: Record<Status, string> = {
  OK: "",
  UNAVAILABLE: "n/a",
  NO_SKILL: "no skill",
  OBS_UNCERTAIN: "obs unc.",
};

export const STATUS_EXPLAIN: Record<Exclude<Status, "OK">, string> = {
  UNAVAILABLE: "Input missing, invalid or out of range. No confidence is shown — this is not a sign the forecast is fine.",
  NO_SKILL: "Beyond the skill horizon. No useful skill — do not use this forecast.",
  OBS_UNCERTAIN: "IMD and IMERG disagree or gauge density is low here, so busts cannot be verified.",
};

export function pct(p: number | null | undefined, digits = 0): string {
  return p == null ? "—" : `${(p * 100).toFixed(digits)}%`;
}

export function fmtInit(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 13)} UTC`;
}

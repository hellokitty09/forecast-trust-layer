// Fail-safe tests (hard rule 4): bad or incomplete input must never render as HIGH.
import { describe, expect, it } from "vitest";
import { confidenceFor, parseCard, parseMapRegion } from "./schema";

const good = {
  card_id: "c1", schema_version: "1.0", init_time: "2022-08-12T00:00:00Z", valid_date: "2022-08-17", lead_day: 5,
  region_id: "IMD_SUB_ODISHA", variable: "rain", status: "OK", bust_prob: 0.1, confidence: "HIGH",
  model: { version: "v", sha256: "x" }, inputs: { source: "s", sha256: "y" },
};

describe("confidence bands", () => {
  it("follows HIGH < 0.2 ≤ MEDIUM < 0.5 ≤ LOW", () => {
    expect(confidenceFor(0.19)).toBe("HIGH");
    expect(confidenceFor(0.2)).toBe("MEDIUM");
    expect(confidenceFor(0.49)).toBe("MEDIUM");
    expect(confidenceFor(0.5)).toBe("LOW");
  });
});

describe("parseCard fail-safe", () => {
  it("accepts a valid card", () => {
    const r = parseCard(good);
    expect(r.ok && r.card.confidence).toBe("HIGH");
  });
  it("rejects out-of-range probability", () => {
    expect(parseCard({ ...good, bust_prob: 1.4 }).ok).toBe(false);
  });
  it("rejects lead outside 1–10", () => {
    expect(parseCard({ ...good, lead_day: 11 }).ok).toBe(false);
  });
  it("downgrades OK without a probability to UNAVAILABLE", () => {
    const r = parseCard({ ...good, bust_prob: null });
    expect(r.ok && r.card.status).toBe("UNAVAILABLE");
    expect(r.ok && r.card.confidence).toBeNull();
  });
  it("never shows HIGH when the server label disagrees with the probability", () => {
    const r = parseCard({ ...good, bust_prob: 0.7, confidence: "HIGH" });
    expect(r.ok && r.card.confidence).toBe("LOW");
  });
  it("caps unprecedented patterns at LOW", () => {
    const r = parseCard({ ...good, novelty: { score: 0.99, unprecedented: true } });
    expect(r.ok && r.card.confidence).toBe("LOW");
  });
  it("strips confidence from non-OK statuses", () => {
    const r = parseCard({ ...good, status: "NO_SKILL" });
    expect(r.ok && r.card.confidence).toBeNull();
  });
});

describe("parseMapRegion fail-safe", () => {
  it("returns null for garbage", () => {
    expect(parseMapRegion({ region_id: 3 })).toBeNull();
  });
  it("downgrades OK without probability", () => {
    expect(parseMapRegion({ region_id: "X", status: "OK", confidence: "HIGH" })?.status).toBe("UNAVAILABLE");
  });
});

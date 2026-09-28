# Competitor addendum — SIH26079 GitHub re-check (26 Sep 2026)

Adds the **14 new SIH26079 repos** found on GitHub to the 18 in the competitor PDF. After removing duplicates
and one unrelated repo, that makes **27 unique repos**. The PDF's 18 are not reproduced here; keep the PDF alongside.
Summary and consequences: `DESIGN.md §3.0`.

All facts below come from each repo's README and code as seen on 26 Sep 2026. Re-check before quoting on a slide.

## 🔴 Strong: real data + real results

| # | Repo | What they built | Data | Standout | Gap | Take | Don't copy | Our edge |
|---|---|---|---|---|---|---|---|---|
| 1 | CoffeeAurCode/The-Bust-Atlas-of-India (Vishwas, Team Gryffindor) | Region × Day 1–10 bust probability, live site | Real ECMWF IFS ensemble, test year 2022 | Bust = 95th-percentile error per region/lead/season. Ensemble-agnostic: trained on ECMWF, tested on Google WeatherNext 2 without retraining. Honest operational number: "flagged regions bust 3.1× more" | Margin over ensemble spread tiny (ROC 0.663 vs 0.655). Truth is ERA5 500 hPa, not IMD observations | **Lift** metric (§10); cross-model test without refit | ERA5 as truth for rain | IMD/IMERG truth; 20-yr GEFSv12; Error Anatomy; signed cards |
| 2 | AdarshSingh4455/Burst-Forecast-System (FORTRESS) | Reliability + stress-testing layer | Real NOAA GEFSv12 + ERA5 | Analogues, "Failure DNA", out-of-distribution check, Trust Horizon, self-audit | One East-UP box, 12 dates | Nothing new — we already have skill horizon, analogs, novelty | Tiny-sample claims | All-India scale, LOYO over 20 years with CIs |
| 3 | Roopalgn/sih-backup | Grid-level bust map | Real GEFSv12 + **IMD gridded rain as truth** | Attention U-Net, Integrated Gradients, `data_source` label on every output (real vs illustrative) | 4 subdivisions, rain only, Day 3/5/7/10, trained on 2021 monsoon only | Per-output data-source label (we have `illustrative` + `inputs.source`) | Grid DL on one season | 36 subdivisions, Day 1–10, multi-variable, 20 years |
| 4 | anuj-sharma7/Bust-Detection (AtmosGuard) | Day 3–7 bust early warning | CDS/ERA5, GEFS, NOMADS | Ensemble disagreement, regime transition, multi-model disagreement, run-to-run jumpiness; tracks risk until the event | Day 3–7 only; held-out results unclear in README | Run-to-run jump as a feature (already in our Start group) | Unverified claims | **Live Bust Watch**: updates from real observations, not just model runs |
| 5 | adishxm/Veyra-…-VERSION-3 (Veyra Sentinel, Team HEXARK) | Looks like v3 of the PDF's Veyra; a big upgrade | GEFS, ERA5, WeatherBench | 6 hazard specialists (precip, cyclone, monsoon LPS, WD, heat wave, wind), abstention, conformal calibration, CAP v1.2 mapping doc, digital-twin replay | Self-described "experimental heuristics", held-out verification pending; replay is synthetic | Abstention (we: UNAVAILABLE / NO_SKILL / novelty cap) | Per-system specialists without event counts | Verified per-system scores with counts + CIs; **working** signed CAP export |

## 🟠 Medium: full pipeline, weak or unclear data

| # | Repo | What they built | Standout | Gap | Our edge |
|---|---|---|---|---|---|
| 6 | neel92654/ForecastGuard | 15 subdivisions, Q90 bust, XGBoost + isotonic | Reason codes (HIGH_ENSEMBLE_SPREAD, LONG_LEAD_TIME), model-comparison benchmarks | No real data source visible in code | Synoptic-language reasons + Error Anatomy on real data |
| 7 | AdeshSrivastava-06/VortexXAI = nandvilkararyan/VortexXAI (same project, 2 copies) | Grid-level bust risk, 3D map (deck.gl) | ConvLSTM + LightGBM + CatBoost stacking; SHAP and LIME | Fixed thresholds (rain > 25 mm or T > 3 °C), deterministic inputs | Percentile + floor bust definition, ensemble inputs |
| 8 | ARYANatGIT/fcg (ForecastGuard AI) | Bust prediction + calibration | Detailed physics (CAPE, CIN, lapse rates), analog search, multi-model | Mostly Open-Meteo data; README heavy on maths, light on results | Results with CIs, IMD truth |
| 9 | abhi-vyakti/ForecastGuard (Team Zephyr) | State-level map, replay animation | 100% offline mode; "before vs after" workflow demo | Metrics on synthetic replay data (ROC ~0.75) | Replay only from real cycles; offline bundle of the last signed map |
| 10 | SAI0969/Bust-Detection-Small-Potato-Stuff | Confidence + bust probability | AI residual correction (also corrects the forecast) | Template-like, no real data seen | Out of scope for us: we don't correct forecasts (§4) |

## 🟡 Weak: synthetic data or frontend only

| # | Repo | Note |
|---|---|---|
| 11 | Praakritik-Banerjee/weather | Synthetic data generator; SHAP → meteorological lexicon; "What-If" lab |
| 12 | jai-ganesh-R/ForecastFusion | React frontend only, mock data |
| 13 | ParinidhiJain101/Veyra-… | Probably the PDF's Veyra (GEFS 31 members + logistic regression) |

## Duplicates / unrelated

- **Developer-Amit21/AI-Forecast-Bust-Detection**: README is "AeroBust", the PDF's AeroBust under another repo name.
- **Sharafat5530/SIH26079-Forecast-Intelligence**: README says "Team: Synapse Fusion", the PDF's Repo 1.
- **AryanSahu321/sih**: SIH problem-statement selection matrix, not a SIH26079 project.
- Live site **forecast-bust-ai.vercel.app** exists; its repo was not found.

## What still nobody has (27 repos)

1. Confidence updated from **live observations** after issue → our Live Bust Watch (DESIGN §13).
2. **Signed, hash-chained** Trust Cards → our Forecast Black Box (DESIGN §14, `/v1/verify`, `/v1/chain`).

Everything else exists somewhere in some form, so our remaining edge is **execution quality**: all India, real held-out
data, IMD truth, event counts and CIs next to every score.

# DESIGN.md — Forecast Trust Layer (FTL) for SIH26079

Micro design doc. Status: **v2.1 (27 Sep 2026)** — merges v2.0 (full coverage of the planning discussion; Appendix Z maps each item to its section) with the parallel build-thread additions: §3.0 GitHub re-check of 27 repos, TrustCard schema 1.1 (Live Bust Watch fields), and three new §11 endpoints (`/v1/chain`, `/v1/keys`, `/v1/trust/history`). Working name "Forecast Trust Layer"; final product name TBD by team.
Everything here is decided unless listed in §17 Open questions.

---

## 1. Problem (PS SIH26079, MoES / NCMRWF, Software, Disaster Management)

Medium-range forecasts (Day 1–10) sometimes fail badly ("forecast busts") during rapidly evolving systems: **monsoon depressions, heavy rainfall, western disturbances, cyclones, heat waves, break/active monsoon**. Build an AI/ML system that identifies **regions and lead times** likely to have high uncertainty or large error by **comparing current NWP forecast patterns with historical forecast error behaviour**, and provides a **forecast confidence indicator**.

### Required outputs → where we satisfy them
| PS expected outcome | Our component |
|---|---|
| Forecast confidence map (region-wise, Day 1–10) | §8 models → §11 map endpoint + UI |
| Forecast bust probability | §8.B/§8.E calibrated probability |
| Error-prone area detection | §7.1 systematic-bias map + §8.A skill horizon |
| Explainable output (meteorological reasons) | §9 Error Anatomy + synoptic templates + analog cases |
| Prototype dashboard / API | §11 FastAPI + §12 UI |

No dataset is provided by the PS. No scoring weights are published.

---

## 1A. Who uses it, and why

### The core problem for users
A medium-range forecast arrives as one map per day with no statement of how far to trust it. Today a forecaster judges trust **informally**: comparing models by eye, remembering past failures, checking ensemble plumes. That judgement is subjective, not recorded, and not shared with downstream users. When a bust happens (a depression tracks elsewhere, a heat wave starts late, heavy rain falls where none was forecast), warnings go out with full confidence and are wrong, or are not issued at all. The PS names this directly: busts "can affect operational decision-making".

**FTL's job:** turn that informal judgement into an **objective, per-region, per-day, recorded trust signal with a reason**, available at the moment the decision is made.

### Users (in priority order)

| # | User | Where | Decision they make | Pain today | What FTL gives them | Main views |
|---|---|---|---|---|---|---|
| **1 · Primary** | **Duty forecaster** (NCMRWF operations, IMD national and regional forecasting centres) | Forecast desk, each model cycle | What to put in the bulletin/warning: colour code, wording ("likely" vs "very likely"), whether to hold a warning until the next run | Must judge 36 subdivisions × 10 days × several variables by eye in limited time | Confidence map + Trust Card: where and when not to trust the forecast, **why**, and what to do (Error Anatomy action), similar past cases | National map, Trust Card, alerts list, live cycle updates |
| **2 · Primary** | **NWP model developer / verification scientist** (NCMRWF) | Model development | Which regions, seasons, systems and lead times to fix first; whether a model upgrade helped | Verification is aggregate (monthly/seasonal scores), hard to link errors to weather situations | **Error-prone (bias) map**, skill horizon, per-system scorecard, bust archive with causes | Bias map, scorecard, replay |
| 3 · Secondary | **Disaster managers** (NDMA / SDMAs, district control rooms) | Preparedness planning, 2–7 days ahead | How early and how much to pre-position (NDRF teams, evacuation readiness, dam releases) | Receive warnings without any confidence; cannot tell a solid Day-5 warning from a shaky one | Warning **with** confidence and trust horizon (CAP parameters), "re-check after next run" guidance | CAP alerts, simplified confidence view |
| 4 · Downstream (via IMD, not direct) | Sector advisory services: agromet advisories, reservoir/hydropower operations, power grid load planning | Weekly advisories | Whether to advise sowing / spraying / irrigation, release water, plan load | Advice based on single forecast, no risk qualifier | Confidence qualifier inherited through IMD products | API only |

**Not a user:** the general public. The public view is only a rounded, read-only confidence map. Public weather communication stays with IMD. FTL is **decision support**; it never issues or suppresses an official warning.

### Why each user will use it

| User | Reason to adopt | Value measure |
|---|---|---|
| Duty forecaster | Saves time (flags the few risky region-days out of hundreds), gives a defensible reason, catches busts earlier via live cycle updates | Fewer high-confidence warnings that bust; lead time at which risk is flagged; time to review a cycle |
| Model developer | Links model errors to weather systems and physical causes (bias vs start vs chaos) | Bias and skill maps reproduce known problem areas; upgrade impact visible per system |
| Disaster manager | Can match response scale to forecast reliability, reduce costly false mobilisations and missed events | Relative Economic Value curve (cost–loss) above baseline |
| Downstream sectors | Risk-qualified advice | Adoption of confidence field in IMD advisories (future) |

### A day in the life (primary user)
1. **Morning:** the 00 UTC run (initialised 05:30 IST) becomes available a few hours later. FTL scores it within minutes and signs the Trust Cards.
2. Forecaster opens the national map: most regions green; **Odisha Day 4–6 rain LOW**, Error Anatomy 55% chaos, reason "LPS track spread over central India", 7 of 11 similar cases busted.
3. Forecaster keeps the Odisha heavy-rain alert at orange instead of red, writes "likely", notes "re-check at 12 UTC run".
4. **Evening:** the 12 UTC run (initialised 17:30 IST) arrives. Live cycle update shows run-to-run jump shrinking, confidence now MEDIUM. Forecaster upgrades the alert.
5. The CAP alert to SDMAs carries `forecastConfidence=MEDIUM`, `trustHorizonDay=5`. The SDMA pre-positions teams in the two most exposed districts only.
6. After the event, verification scientist opens the replay: the card, signature and audit chain show exactly what was said and when.

### Role mapping (drives RBAC in §14)
| Role | Who | Can |
|---|---|---|
| `public` | Anyone | Rounded national confidence map, verify page |
| `sdma` | NDMA / SDMA / district officials | Confidence map, alerts, CAP |
| `forecaster` | NCMRWF / IMD forecasters | Everything above + full Trust Cards, analog cases, feedback |
| `scientist` | NCMRWF model developers | Bias maps, scorecards, bust archive, replay |
| `admin` | System operators | Configuration, keys, deployments (MFA) |

---

## 2. Product in one paragraph

A trust layer on top of any NWP system (ECMWF / GEFS now, NCMRWF NCUM/NEPS later). For every **region × variable × lead day** it answers:
1. **Is the forecast useful here?** → Skill Horizon.
2. **How likely is an unusually bad error today?** → calibrated bust probability + q10–q90 range.
3. **Why?** → **Error Anatomy**: model bias / uncertain start / chaotic weather, in synoptic language.
4. **How sure are we of the answer?** → observation certainty, similar past cases, novelty flag.
Updated every model cycle, exported inside CAP alerts, every output signed.

## 3. Differentiation (from analysis of 32 competing SIH26079 projects)

| Layer | Features | Competitor coverage |
|---|---|---|
| Baseline (must match) | Percentile bust definition, GBM, calibration, SHAP, map + API, analogs | 13–27 of 32 projects |
| Execution edge | Real data + honest held-out; IMD truth; beat calibrated ensemble spread; per-system verified scores; heavy-rain miss vs false alarm; novelty flag; error range | 4–8 of 32, mostly partial or claimed only |
| **Nobody has** | **Error Anatomy**, **live cycle update**, **signed Trust Cards**, **confidence inside CAP**, SEEPS-based rain busts | 0 of 32 (CAP appears in 2 projects only as a UI label / doc, with no confidence field) |

Competitor facts to respect: best real-data margins over ensemble spread are small (+0.008 and +0.025 AUROC). 14 of 32 projects use synthetic / mock / frontend-only data.

### 3.0 GitHub re-check (26 Sep 2026): 27 unique repos
The 18 repos from the competitor PDF plus 14 more SIH26079 repos found on GitHub, minus duplicates, give 27 unique repos. Full list with "take / don't copy / our edge": `docs/COMPETITORS.md` (Appendix A below is the condensed table). Three earlier claims no longer hold:

| Earlier claim | Now |
|---|---|
| "Nobody uses IMD gridded rainfall as truth" | ❌ Roopalgn/sih-backup does (4 subdivisions only); Bhushan (Sanket) code uses `imdlib` |
| "Nobody does anything per weather system (6 systems)" | ⚠️ Veyra Sentinel V3 has 6 hazard specialists, self-described as experimental heuristics, not verified |
| "No CAP / SACHET in any repo" | ⚠️ Veyra V3 has a CAP v1.2 mapping document; no working pipeline seen |
| "Nobody signs / tamper-proofs outputs" | ✅ Still true — only feature-hash checks found, no output signing |
| "Nobody updates bust probability from live observations" | ✅ Still true — Veyra states it does not use live observations; AtmosGuard tracks run-to-run evolution, not live obs |

**Where our edge now is** (build and demo these first):
1. **Live Bust Watch** (§13): after a forecast is issued, confidence is updated from newer cycles and real observations, and every update is visible as a signed history.
2. **Forecast Black Box** (§14): every Trust Card signed and hash-chained, publicly verifiable (`/v1/verify`, `/v1/chain`).
3. **Execution quality**: what others only claim (6 systems, CAP, IMD truth), we show for all of India, on real held-out data, with event counts, CIs and the truth source printed next to every score.

**Ideas worth taking** (credited in `docs/COMPETITORS.md`): an operational lift number ("flagged region-days bust 3.1× more often", Bust Atlas) → §10 metric; a data-source label on every output (Roopalgn) → our `illustrative` flag + `inputs.source`; abstention (Veyra) → our `UNAVAILABLE` / `NO_SKILL` / novelty cap; ensemble-agnostic cross-model test (Bust Atlas) → our IFS cross-model test.

A second, later GitHub pass (`docs/COMPETITORS.md` update, `docs/PLAN.md`) found 18 further repos via a separate competitor PDF and 8 MVP-critical features common to them (multi-NWP disagreement engine, calibrated 0–100% probability, uncertainty range, top-3 drivers, a trust score, Day 1–10 risk map, historical-analog counts, and real held-out validation with PR-AUC/ROC-AUC/Brier/ECE/false-alarm/recall). That backlog is tracked in `docs/PLAN.md`, not duplicated here.

### 3.1 Standout: Error Anatomy
Split the expected residual error into three physical causes, each mapped to a different forecaster action:

| Cause | Meaning | Action shown |
|---|---|---|
| Model bias | Systematic error for this region/lead/season | "Auto-correctable" |
| Uncertain start | Initial-condition uncertainty (data-sparse areas, run-to-run jumps, analysis disagreement) | "Wait for next cycle" |
| Chaotic weather | Flow-dependent predictability loss (LPS track spread, WD timing, BSISO transition, instability) | "Use ensemble / probabilistic wording" |

### 3.2 Supporting features
Skill Horizon · Live cycle update · Signed Trust Cards (Forecast Black Box) · CAP v1.2 with confidence params + XML-Signature · heavy-rain miss vs false-alarm probabilities · unprecedented-pattern flag · per-variable confidence · per-system scorecard with event counts.

### 3.3 Example Trust Card (illustrative numbers)
```
ERROR ANATOMY · Odisha · Rainfall · Day 5 · Init 12 Aug 00Z
Skill horizon:     rain forecast useful up to Day 5
Bust probability:  58% (range 41–72%)   Confidence: LOW
Why it may fail:   Model bias 25% → auto-correctable
                   Uncertain start 20% → wait for 12Z run
                   Chaotic weather 55% → use ensemble
                   "Depression track spread over central India; BSISO entering break phase"
Heavy rain:        miss 34% · false alarm 12%
Observation certainty: HIGH (IMD and IMERG agree)
Similar past cases: 7 of 11 busted  [view]
Signed: ed25519 ✓ (chain #10492)
```

### 3.4 Pitch and positioning
- Pitch line: **"Others tell you a forecast might fail. We tell you *why* it will fail — model bias, a bad start, or chaotic weather — and what to do about each."**
- Secondary line: "Our confidence updates every cycle, travels inside the warnings India already sends, and is signed so nobody can fake it."
- **Do not lead with:** "XGBoost + SHAP", "a dashboard", or any synthetic-data accuracy. These are saturated among competitors or will be challenged by judges.
- Honest framing: winning is not guaranteed; the edge comes from execution (real data, full India, held-out years, honest baselines) plus Error Anatomy.

---

## 4. Scope

**In:** rainfall (primary), daily Tmax, 850/200 hPa winds, WD trough timing, cyclone/LPS track; India land (36 IMD subdivisions + districts via area weights); lead Day 1–10; 00 UTC cycles (00/06/12/18 for live update).
**Out (non-goals):** producing a weather forecast; nowcasting / radar storm detection; sending messages to stations or phones; SACHET push (format compatibility only); Kafka / Kubernetes; LLM-generated explanations; grid-level deep learning in MVP.

Out-of-scope ideas that were considered and rejected (outside PS): live storm detection from radar/satellite, messaging interconnected stations, making a better forecast. In-PS versions kept: unprecedented-pattern flag (§9), heavy-rain miss/false-alarm (§7.2), low-confidence alert list (§11).

---

## 4A. Research basis (findings that shape the design)

| PS line / topic | Finding | Design consequence | Status |
|---|---|---|---|
| Large errors (line 1) | NCUM (Clim. Dyn. 2018): forecasts less rain as lead increases; largest errors over Indian region, north Arabian Sea, **Mahanadi basin (Odisha) up to 10 cm/day** | Error-prone map must show these areas → validation check V1 | read |
| Large errors | GraphCast over India: +3.6–3.8 mm/day wet bias; **Western Ghats peak rain under-forecast 15–30%**; wet bias over **Himalayan foothills**; extremes suppressed; intraseasonal propagation degrades beyond 48 h | Validation check V1; BSISO features (§8.1) | read |
| Cyclones (line 2) | GFS N. Indian Ocean 2019–20: track error <150 km up to 48–66 h, **331–359 km at 120 h**; intensity mostly under-predicted | Object-based track-bust model (§8.2 F) | read |
| Heat waves (line 2) | IITM–IMD extended range: skill 1–2 weeks, over-forecasts, **misses onset timing/location**, weaker over SE coast | Tmax verification, onset-timing labels | read |
| Monsoon depressions | Frequency fell from ~7–8 per season historically to **~2–3 per season** since the 1980s while low-pressure areas increased; IMD 2023 report: 2 depressions vs normal 6 | Use **LPS class** not MD (§5.5) | read |
| Break spells | Rajeevan 2010 (1951–2007): 26% of years had no break; 40% of breaks last 3–4 days, 32% ≥1 week | Evaluate at transitions (§10) | read |
| Bust definition (line 3) | Rodwell et al. 2013: Europe Day-6 Z500 RMSE > 60 m and ACC < 40%; errors mostly random; ensembles capture only part | Relative+absolute bust; Z500 only for WDs (§7) | read |
| Bust origins | MCS study (Atmosphere 2019): errors start in Rossby-wave ridges and propagate downstream | Upstream predictor domain (§5.2) | read |
| Historical error behaviour (line 5) | Analog ensemble: "similar forecasts have similar error patterns"; Deep Analog 13–17% better, strongest on hard cases | Analog retriever (§8.2 D) | read |
| Confidence (line 6) | Scher & Messori 2018: NN predicts forecast error and ensemble spread (GEFS reforecast); code public | Optional CNN (§8.2 G) | read |
| Explainability (line 10) | McGovern et al. 2019 (BAMS): interpretation methods for ML in meteorology | Grouped SHAP + synoptic templates (§9) | search only |
| Data | WeatherBench 2: HRES 2016–2022, Day 1–10, public Zarr; GEFSv12 reforecast 2000–2019 details verified from NOAA doc; NCMRWF portal shows only reanalysis publicly | §5.1 | read |

**Validation checks derived from research** (must pass, reported in `reports/`):
- **V1** Error-prone (bias) map highlights Mahanadi/Odisha, Western Ghats (under-forecast) and Himalayan foothills.
- **V2** Error grows with lead; cyclone track error at Day 5 is of order 300 km for GEFS/IFS.
- **V3** Error Anatomy: cyclone cases → Chaos share dominant; Western Ghats monsoon rain → Bias share dominant.

---

## 5. Data

### 5.1 Sources
| Role | Dataset | Key facts |
|---|---|---|
| **Primary training** | **GEFSv12 reforecast 2000–2019** (AWS `noaa-gefs-retrospective`) | 00 UTC daily, **5 members** (11 weekly), **0.25° + 3-hourly to Day 10**, has **2 m Tmax/Tmin**, precip, winds, MSLP, soil moisture |
| Recent test | Operational GEFSv12 2020-09 → 2024 | Same model version as reforecast |
| Cross-model test | ECMWF IFS HRES (+ ENS mean/spread) via WeatherBench 2, 2016–2022 | Public Zarr; full 50-member ENS ≈ 105 GB → store mean/spread only |
| Deployment target | NCMRWF NCUM / NEPS hindcasts (+ DA innovations) | **Requested**, not guaranteed |
| Truth: rain | IMD gridded rainfall 0.25° daily (`imdlib`) | Rain day ends 08:30 IST (03 UTC) |
| Truth: temperature | IMD gridded Tmax/Tmin 1° | Heat-wave verification |
| Second rain truth | GPM IMERG (+ IMD–NCMRWF merged satellite-gauge) | Observation-uncertainty mask, sea areas |
| Winds / upper air | ERA5 | Tropics verification of 850/200 hPa |
| Cyclones | IMD RSMC New Delhi best-track | Object verification |
| LPS lists | IMD end-of-season monsoon reports + objective tracker output | Lows, well-marked lows, depressions |
| Modes | BSISO / MJO indices, ENSO (Niño 3.4 / ONI), IOD (DMI) | Init-time values only |
| Static | 1-km DEM (elevation, slope), distance to coast, windward index | |
| Boundaries | Survey-of-India-compliant IMD subdivision + district shapefiles | Official maps only |

### 5.2 Domains and grids
- Verification / features at **0.25°** over India (≈5–38°N, 65–100°E). Never use 1.5° for India-scale verification.
- Large-scale predictors from **upstream domain 30–120°E, 15°S–45°N at 1.5°** (WDs, jets, Bay/Arabian Sea).
- Regridding: **conservative** (`xESMF`), obs → forecast grid when grids differ.

### 5.3 Time conventions
- All UTC. Daily rain accumulated **03→03 UTC** (possible with GEFSv12 3-hourly; for 6-hourly IFS use 00→00 and record the offset).
- Tmax = true daily maximum field (GEFSv12) or diurnally corrected (IFS 6-hourly underestimates the ~09 UTC peak).
- Seasons are **onset-relative** per region (normal onset Kerala ~1 Jun, all-India ~8 Jul; use IMD normal-onset isochrones) plus pre-monsoon, post-monsoon, winter.

### 5.4 Data volume strategy
- Stream from S3/GCS → crop → compute region/grid aggregates → Parquet. Keep only aggregates (target: < 20 GB total).
- Naive IFS HRES 0.25° India crop, ~14 fields, all 6-hourly steps, 2 cycles/day ≈ **200+ GB** → MVP uses 00 UTC + daily steps only ≈ **30 GB** working set, not retained.
- GEFSv12 files are global per variable per cycle (TB-scale transfer): start with **precip + Tmax**, run downloads on a server/VM.

### 5.5 Event counts (drive what we can claim)
| Class | 2016–2022 | 2000–2019 (GEFSv12) | Use |
|---|---|---|---|
| Cyclonic storms (N. Indian Ocean) | **35** (4,3,7,8,5,5,3) | **81** (+24 in 2020–24) | Shared track-bust model on GEFSv12; evaluate with CIs |
| Monsoon depressions (JJAS, true MDs) | **~18–20** (26 Jun–Sep systems incl. cyclones) | ~50–60 | Case studies only |
| **Monsoon LPS** (lows + WML + depressions) | **~90–100** (~12–15 per season) | **~250+** | System class for training/eval |
| Break spells (Rajeevan rule) | ~7–14 (estimate; compute) | ~25–45 | Evaluate at **transitions** (~100–400 cases) |
| Heavy-rain grid/subdivision-days | thousands | — | Train + evaluate |
| WDs, heat-wave spells | hundreds / ~100+ | — | Train + evaluate |
Always print event counts next to any per-system score.

### 5.6 Data-quality checks (automated, `pandera` + tests)
Units (m→mm), accumulation vs rate, 03 UTC alignment, lead off-by-one (known-case unit test), missing days never filled with 0, IMD gauge-count changes tracked, physical range checks, provenance manifest (source URL, SHA-256, download time) for every file.

### 5.7 Effective sample size
IFS 2016–2022 at subdivision level: ~2,560 cycles × 10 leads × 36 subdivisions ≈ **920,000 rows / variable**, ~64,000 bust labels. Errors persist 2–3 days and span 5–8 neighbouring subdivisions, so the **effective independent sample is roughly ~20,000 rows / ~1,500 busts** (rough estimate). Consequences: block bootstrap by date (§10); no per-system models; do not quote row counts as evidence.

### 5.8 Data tiers (build order)
| Tier | Data | Enables |
|---|---|---|
| T0 (M0, days) | WeatherBench 2 IFS HRES 0.25° India + IMD rain | Bias map, skill horizon for the idea PPT |
| T1 | + IMD Tmax, IMERG, ERA5 winds, IFS ENS mean/spread | Obs mask, Tmax, ensemble baseline |
| T2 | + GEFSv12 reforecast 2000–2019 + operational 2020–24, best-track, LPS lists, BSISO/ENSO/IOD | Main training, per-system evaluation |
| T3 | + NCMRWF NCUM/NEPS hindcasts + DA innovations | Deployment claim, strongest live signal |

### 5.9 Data verdict
| Use | Enough data? |
|---|---|
| Idea PPT figures | ✅ T0 |
| Rain + Tmax bust model at subdivision level | ✅ |
| Error Anatomy, analogs, calibration | ✅ with GEFSv12 |
| Per-system claims (cyclone, LPS, break) | ⚠️ only with GEFSv12, always with CIs and event counts |
| Grid-level deep learning | ❌ not in this timeline |
| "Deployable at NCMRWF" claim | ⚠️ needs T3 |

---

## 6. Weather-system definitions (official)
| System | Definition / detector | Verified against |
|---|---|---|
| LPS / depression / cyclone | IMD classes by max sustained wind: low <17 kt, depression 17–27, deep depression 28–33, cyclonic storm 34–47, … Detector: **TempestExtremes** on 850 hPa relative vorticity + MSLP minimum (coarse models underestimate winds) | IMD best-track, IMD LPS lists |
| Western disturbance | Upper-level (500/200 hPa) trough in subtropical westerlies, tracked upstream (Iran–Afghanistan–Pakistan) | ERA5 troughs |
| Heat wave | IMD: Tmax ≥40 °C plains / ≥37 °C coastal / ≥30 °C hills **and** departure ≥4.5 °C (severe >6.4 °C), or Tmax ≥45 °C | IMD 1° Tmax |
| Active / break | Rajeevan et al. 2010: monsoon core zone **18–28°N, 65–88°E**, Jul–Aug, standardized rain anomaly **>+1 / <−1 for ≥3 consecutive days** (IITM pentad variant ±40%) | Computed from IMD 0.25° |
| Heavy rain | IMD categories: heavy 64.5–115.5, very heavy 115.6–204.4, extremely heavy ≥204.5 mm/day | IMD 0.25° |

---

## 7. Labels

### 7.1 Systematic bias
`bias(region, variable, lead, season)` = mean error on training folds only. Published as the **error-prone area map**. Remove before bust labelling.

### 7.2 Residual and scores
- Residual = error − bias.
- Rain: **SEEPS** (via `scores`; handles zero-inflated, heavy-tailed rain), plus IMD category **miss** and **false alarm** labels (two separate targets), plus **Fractions Skill Score** (neighbourhood) so a slightly displaced system is not counted as a total failure (double-penalty fix).
- Tmax: residual of daily max.
- Winds: 850/200 hPa vector error (tropics). **Do not use Z500 as a tropical metric**; Z500/200 trough position/timing only for WDs.
- Cyclone/LPS (object-based): track error (km), landfall timing error, intensity error vs best-track.

### 7.3 Bust definition
`bust = residual_score > P_q(region, lead_band, season)` **AND** `abs_error > floor`.
Config: `q = 0.93` (range 0.90–0.95), floors: rain 10 mm/day, Tmax 2 °C (tunable, documented).

### 7.4 Skill label
Per region × variable × lead: skill vs climatology (SEEPS skill / BSS) with bootstrap lower bound; skill ≤ 0 → "no useful skill".

### 7.5 Observation-uncertain mask
Cell/day flagged when IMD and IMERG disagree beyond a configured relative threshold, or gauge density is below a threshold (hills, islands, J&K/Ladakh, NE). Masked cells are **excluded from bust labels** and shown as "observation uncertain".

### 7.6 Two separate outputs (why)
A relative bust threshold makes every region/lead bust ~(1−q) of the time by construction, so it **cannot** show error-prone areas or confidence decay with lead. Therefore FTL always reports both:
- **Relative bust probability** — "unusually bad for these circumstances" (ML target, §7.3).
- **Absolute skill / bias** — systematic bias map (§7.1) and skill vs climatology (§7.4), which drive the error-prone map and Day 1–10 decay.

---

## 8. Features and models

### 8.1 Feature groups (define Error Anatomy)
| Group | Features |
|---|---|
| **Bias** | region, lead, onset-relative season, elevation, slope, coast distance, windward index, **model version / cycle id** (non-stationarity from model upgrades) |
| **Start** | run-to-run jump (same valid time, consecutive cycles), ECMWF–GFS analysis difference at init, data-sparse-area indicators, DA innovations (if NCMRWF provides) |
| **Chaos** | ensemble spread / mean-minus-control / cluster count, multi-model disagreement, LPS/cyclone/WD/heat-wave/active-break flags, BSISO phase+amplitude, ENSO, IOD, monsoon trough latitude, Somali jet speed, 200 hPa easterly jet, precipitable water, 700–500 hPa RH, K-index, 850–200 hPa shear, soil moisture, Bay/Arabian Sea SST anomaly |
Derived meteorology via `MetPy`. All features computed from init-time information only.

### 8.2 Models
| ID | Model | Detail |
|---|---|---|
| A | Skill-horizon | Per region × variable × lead skill vs climatology → last useful lead |
| B | Distributional error | **LightGBM quantile** (q10/q50/q90 of residual), **separate per lead band 1–3 / 4–6 / 7–10** |
| C | Bust classifier | LightGBM binary; **monotone constraints** (e.g., ↑ensemble spread never ↓ probability) |
| D | Analog retriever | PCA/EOF of 850 hPa wind + MSLP + rain + mode state → `faiss` k-NN → similar cases, their outcomes, **novelty score** (flag top 2–3% most novel) |
| E | Stacking + calibration | Combine B/C/D → **isotonic** calibration + **conformal** intervals (`MAPIE`) |
| F | Track-bust | GBM on ensemble track spread, 850–200 hPa steering flow, shear, SST (GEFSv12 only) |
| G (optional) | Small CNN | Stacking input only; kept only if it beats E on held-out |
Separate outputs per variable (rain, Tmax, wind). Rain has two heads: heavy-rain **miss** and **false alarm**.
Framing for NCMRWF judges: the ML **corrects the ensemble spread–skill relationship for India** (ensembles are under-dispersive in the tropics); it does not replace the ensemble.
Deep models: lead-band tree models first; any neural model must beat them on held-out years to be kept.

---

## 9. Explanations
- **Error Anatomy** = grouped TreeSHAP (sum within §8.1 groups, normalized to 100%). Presented as "attribution by physical feature group", not exact physics. Sanity checks: cyclone cases → large Chaos share; Western Ghats rain → large Bias share.
- **Reason text** from fixed synoptic templates only (no LLM), e.g. "uncertainty in monsoon trough position", "LPS track spread over central India", "WD arrival timing over J&K", "BSISO entering break phase".
- **Similar cases**: top-k analogs with date, system, what went wrong.
- **Novelty**: "Unprecedented pattern — history cannot judge this forecast" → confidence capped LOW.
- **Skill horizon**: beyond it show "No useful skill — do not use this forecast", not a bust probability.

---

## 10. Validation protocol (reported in `reports/`)
- **Leave-one-year-out** on GEFSv12 2000–2019; test on operational GEFSv12 2020–2024; **cross-model** test on IFS 2016–2022 without refitting.
- Baselines: climatological bust rate; lead-only; **calibrated ensemble spread (the bar)**.
- Metrics: Brier Skill Score, reliability diagram, ROC-AUC, PR-AUC, **Relative Economic Value**, CRPS / interval coverage (target 0.88–0.92 for 90%), and **lift** = bust rate in flagged region-days ÷ overall bust rate (an operational number forecasters understand; computed server-side, never trusted from an uploaded file).
- Every reported score states its **truth source** (IMD / IMERG / ERA5 / best-track) next to the number.
- **Block bootstrap by date** (busts are spatially/temporally correlated) → 95% CIs.
- Reported per lead band, per variable, per system (**with event counts**; "indicative" if < 30 events).
- Break/active evaluated at **transitions**.
- Live-update back-test: does run-to-run / DA signal improve Day 2–5 skill? Report either way.
- Leakage test in CI (feature timestamp ≤ init_time).

---

## 11. API (FastAPI, OpenAPI auto-docs)

| Method | Path | Returns | Role |
|---|---|---|---|
| GET | `/v1/health` | status, data freshness, model version | public |
| GET | `/v1/map?init=&lead=&variable=` | GeoJSON: region → confidence, bust_prob, status | public (rounded) |
| GET | `/v1/trust?init=&lead=&region=&variable=` | **TrustCard** | forecaster/SDMA |
| GET | `/v1/alerts?init=&lead_min=&threshold=` | low-confidence regions + reasons | forecaster/SDMA |
| GET | `/v1/cases/{card_id}` | analog cases | forecaster |
| GET | `/v1/bias?variable=&season=&lead=` | error-prone (bias) map + skill horizon | scientist, forecaster |
| GET | `/v1/scorecard` | per-system / per-lead scores with event counts and CIs | scientist |
| GET | `/v1/cap/{card_id}.xml` | CAP 1.2 alert with confidence params + XML-Signature | SDMA |
| POST | `/v1/verify` | signature + hash-chain validity of a TrustCard | public |
| GET | `/v1/chain` | Forecast Black Box status: cards in chain, head hash, chain + audit-log integrity | public |
| GET | `/v1/keys` | published Ed25519 verification keys (current + rotated) | public |
| GET | `/v1/trust/history?init=&lead=&region=&variable=` | Live Bust Watch: every signed version of one card, oldest first | forecaster/SDMA |
| POST | `/v1/feedback` | forecaster confirm/reject (audit-logged, reviewed before training) | forecaster |

### TrustCard (JSON)
```json
{
  "card_id": "uuid", "schema_version": "1.1",
  "init_time": "2022-08-12T00:00:00Z", "valid_date": "2022-08-17", "lead_day": 5,
  "region_id": "IMD_SUB_ODISHA", "variable": "rain",
  "status": "OK | UNAVAILABLE | NO_SKILL | OBS_UNCERTAIN",
  "skill_horizon_day": 5,
  "bust_prob": 0.58, "bust_prob_interval": [0.41, 0.72],
  "confidence": "HIGH | MEDIUM | LOW",
  "expected_error_mm": {"q10": 4.1, "q50": 11.8, "q90": 31.0},
  "heavy_rain": {"p_miss": 0.34, "p_false_alarm": 0.12},
  "anatomy": {"bias": 0.25, "start": 0.20, "chaos": 0.55},
  "systems": ["MONSOON_LPS"],
  "reasons": ["LPS track spread over central India", "BSISO entering break phase"],
  "novelty": {"score": 0.41, "unprecedented": false},
  "obs_certainty": "HIGH",
  "analog_ids": ["…"],
  "model": {"version": "ftl-1.0.0", "sha256": "…"},
  "inputs": {"source": "GEFSv12", "sha256": "…"},
  "illustrative": true,
  "issued_at": "2022-08-12T04:10:00Z", "supersedes": null, "update_reason": "00 UTC cycle",
  "prev_hash": "…", "signature": "ed25519:<key_id>:…"
}
```
Confidence bands (config): HIGH < 0.2 ≤ MEDIUM < 0.5 ≤ LOW (bust_prob).

**Schema 1.1** adds `issued_at`, `supersedes` (card_id of the version it replaces for the same init × lead × region × variable) and `update_reason`. `issued_at` and `supersedes` are set only by the issuer, never by the model pipeline. `confidence` is always recomputed from `bust_prob` at issue time, never trusted from the proposal.

### CAP 1.2
Standard CAP `<alert>` for the region/district; `<parameter>`s: `forecastConfidence`, `bustProbability`, `trustHorizonDay`, `reason`. Enveloped **XML-Signature** (CAP 1.2 supports it). District geocodes via area-weighted mapping. No SACHET push.

---

## 12. UI (React + TypeScript + MapLibre + ECharts)
1. **National map**: variable selector (per-variable confidence), Day 1–10 slider, confidence colours, "no useful skill" hatch, "observation uncertain" pattern, observation-density overlay, "based on N grid cells" per region (small regions get honest uncertainty), official boundaries only.
2. **Trust Card panel** on region click: probability + range, **Error Anatomy bars**, reasons, heavy-rain miss/FA, **Live Bust Watch history**, similar cases, signature badge.
3. **Error-prone (bias) map** + skill-horizon chart.
4. **Replay**: real historical cycle stepped through lead days, then truth revealed.
5. **Scorecard**: baselines incl. ensemble spread, per-system with event counts and CIs.
6. **Verify page**: paste/upload card → valid/tampered (demo: edit one number → verification fails), plus **Forecast Black Box** chain status and published keys.
7. **Alerts list**: low-confidence regions for a chosen day, with reasons; slots with no valid card are counted, never hidden.
8. **Who it's for**: §1A users, roles, and the "not a user: general public" statement. Every page footer: FTL is decision support; official warnings come from IMD.
Offline fallback: last signed map as static bundle. All "illustrative" values visibly labelled.

---

## 13. Live cycle update — Live Bust Watch
Our main differentiator (§3.0): no competing repo among the 27 reviewed updates confidence from live observations after issue.

Each cycle (00/06/12/18 UTC): recompute Start-group features — run-to-run jump for same valid times, analysis differences, DA innovations (if available), satellite convection (INSAT-3D/3DR, optional) — then re-score affected cards, re-sign, append to chain. Early-hour station/merged rain used only as a supporting signal, QC'd, spin-up-aware (compare against known spin-up bias). Must be back-tested (§10) before it is claimed.

**Mechanism:** affected cards are re-scored and **re-issued**, never edited: the new version carries `supersedes` (the card_id it replaces) and `update_reason` (§11 schema 1.1). The UI shows each card's full signed history. It only shows re-issues that actually happened; it never interpolates or predicts one.

Example (illustrative): 06:00 Odisha Day 3 MEDIUM → 12Z run shifts the LPS track 150 km and early merged rain is 3× forecast → Start share rises → Odisha Day 2–4 LOW, reason "forecast diverging from latest run and observations". The scientific basis (early errors growing into busts) comes from mid-latitude studies; in the tropics convection can grow errors without early signals, hence the mandatory back-test.

---

## 14. Security (threat model STRIDE + ML)
**Why it matters:** FTL tells officials when *not* to trust a forecast during disasters. The dangerous failures are (1) a **fake or buggy "all clear"** (low confidence turned into high before a cyclone), (2) **forged Trust Cards / alerts** spreading on social media, (3) the service **going down during a disaster** when traffic peaks.

| STRIDE | Example | Control |
|---|---|---|
| Spoofing | Fake "confidence HIGH" image goes viral | Signed cards + public verify page; CAP XML-Signature |
| Tampering (input) | Corrupted/modified forecast file → everything looks safe | Checksums, provenance, range validation, cross-model check |
| Tampering (model) | Swapped model file; pickle load = code execution | Text/ONNX models, hash-verified manifest |
| Repudiation | "We never said confidence was low" | Hash-chained append-only audit log |
| Info disclosure | Restricted NCMRWF data leaks | On-prem, TLS 1.3, vault secrets, RBAC data access |
| Denial of service | Traffic spike during a cyclone | Rate limits, caching, CDN for public map, static signed offline fallback |
| Elevation of privilege | Public user alters thresholds | RBAC, short-lived JWT, MFA for admin |

| Priority | Control |
|---|---|
| 🔴 | **Fail-safe**: invalid/missing input → `UNAVAILABLE` (never HIGH) |
| 🔴 | Input integrity: SHA-256 checksums, provenance manifest, physical-range validation, ECMWF-vs-GFS cross-check |
| 🔴 | Safe models: LightGBM text/ONNX only, hash-verified from signed `models/manifest.json` |
| 🔴 | **Ed25519-signed TrustCards** (`PyNaCl`) + `/v1/verify`; keys from env/vault, rotation documented, public key published |
| 🔴 | Auth: JWT (short-lived), **RBAC** public / sdma / forecaster / scientist / admin (§1A), **MFA for admin**, rate limiting |
| 🟠 | Hash-chained append-only audit log (outputs, overrides, feedback) |
| 🟠 | CAP XML-Signature |
| 🟠 | Monotone constraints + perturbation tests; locked holdout gate for any retrained model (feedback poisoning) |
| 🟠 | CI: `pip-audit`, `npm audit`, `bandit`, `semgrep`, `gitleaks`, `trivy`; pinned deps with hashes |
| 🟠 | Web: Pydantic validation, parameterised SQL, CORS allowlist, CSP, HSTS, TLS 1.3 |
| 🟡 | Non-root read-only containers, `cosign` images, CycloneDX SBOM, mTLS internal, OWASP ZAP |
| 🟡 | Compliance: CERT-In Directions 2022 (report incidents within 6 h, keep logs 180 days in India); on-prem / India-region hosting; DPDP Act (minimal personal data); plan for CERT-In-empanelled audit |
| 🟡 | Public tier: rounded probabilities, no model internals (extraction resistance) |
| 🟡 | Drift monitoring on inputs and calibration; alert when reliability degrades |
| — | Hackathon hygiene: repo private until submission; `gitleaks` before every push; no keys in commits |

---

## 15. Tech stack
Python 3.11 · `xarray` `dask` `zarr` `cfgrib` `netCDF4` · `xESMF` · `imdlib` · `geopandas` `regionmask` `rasterio` · `MetPy` · **TempestExtremes** · `scores` (SEEPS) `xskillscore` · `lightgbm` `scikit-learn` `MAPIE` `faiss` · `shap` · optional `torch` · `Prefect` · `MLflow` + `DVC` · `pandera` · Parquet + `DuckDB` (demo), PostgreSQL + PostGIS (deploy) · `FastAPI` + `Pydantic` · React + TypeScript + MapLibre GL + ECharts · `lxml` (CAP) · `PyNaCl` · Docker Compose · GitHub Actions.

---

## 16. Repo layout and milestones

```
configs/            base.yaml, data.yaml, labels.yaml, models.yaml, security.yaml
src/ftl/
  data/             download (gefs, wb2, imd, imerg, era5, besttrack, indices), provenance.py
  prep/             crop, regrid, accumulate_03utc, tmax, seasons, regions
  systems/          lps_tracker (TempestExtremes wrapper), wd_index, heatwave, active_break, heavy_rain
  labels/           bias, residual, seeps, categories, busts, skill, obs_mask, objects
  features/         groups.py (bias/start/chaos), derived_met.py, modes.py, static.py
  models/           skill_horizon, quantile_gbm, bust_clf, analogs, stack_calibrate, track_bust
  explain/          anatomy.py (grouped SHAP), templates.py, novelty.py
  eval/             baselines, metrics, bootstrap, per_system, reports
  live/             cycle_update.py
  serve/            api/ (routers, schemas), cap.py, signing.py, audit_chain.py, auth.py
  pipelines/        prefect flows
ui/                 React app
tests/              test_leakage, test_units, test_alignment, test_failsafe, test_signing, test_api, ...
reports/            validation pack (generated)
docs/               DESIGN.md, OPEN_QUESTIONS.md, module READMEs
```

| Milestone | Deliverable | Done when |
|---|---|---|
| **M0 — Idea PPT (by 30 Sep)** | IFS 0.25° India + IMD rain → **bias map**, **skill-horizon chart**, one mock Trust Card (labelled illustrative), architecture + validation + security slides | Figures from real data; PPT submitted via SPOC |
| M1 Data + labels | GEFSv12 rain+Tmax pipeline, IMD/IMERG truth, bias, SEEPS, busts, obs mask, event lists (LPS, break spells computed, best-track) | Unit/leakage/alignment tests green; event counts reproduced |
| M2 Core models | B/C/E per lead band, baselines incl. ensemble spread | LOYO report with CIs |
| M3 Physics layer | Trackers, modes, derived met, track-bust model | Per-system scorecard with counts |
| M4 Anatomy + analogs | Grouped SHAP, templates, analogs, novelty | Sanity checks pass on known cases |
| M5 Ops | API, UI, CAP, signing, audit chain, live cycle, RBAC | Security tests + `make audit` green |
| M6 Validation pack | Cross-model IFS test, 2020–24 test, live back-test, REV curves | `reports/` complete; demo script rehearsed |

Team: P1 data/truth · P2 met features + trackers · P3 labels + validation · P4 ML + anatomy · P5 backend + security · P6 UI + demo + PPT.

---

## 16A. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Little gain over ensemble spread | Report honestly; value is Error Anatomy, skill horizon, actionable output, live update — not only AUROC |
| NCMRWF data never arrives | Model-agnostic pipeline; show on GEFS + IFS; document NCUM retraining |
| Too few events per system | GEFSv12 20 years, LPS class, transitions, bootstrap CIs, "indicative" labels |
| Grouped SHAP challenged as "not physics" | Present as attribution by physical feature group; validation check V3 |
| Data volume | Crop + aggregate; server/VM downloads; precip + Tmax first |
| Live-update hypothesis fails in tropics | Back-test; if no gain, keep run-to-run consistency only and say so |
| Truth errors blamed on model | Obs-uncertain mask, IMERG second truth |
| Competitors copy ideas | Execution and verified numbers are the moat; repo private until submission |

## 16B. Idea PPT, demo, judge Q&A

**Idea PPT (by 30 Sep; use the official SIH template, verify slide limits):** problem + users (§1, §1A) · solution + Error Anatomy card (§2–3) · architecture (§5–13 diagram) · real T0 figures: bias map + skill horizon · validation protocol + baselines · data plan with event counts · security & trust slide (most competitors have none) · team + timeline · references.

**Demo script (finale, ~60–90 s):**
1. "This is a real past day." Show a normal-looking forecast map.
2. Trust Card opens: system detected, LOW confidence, Error Anatomy, similar cases.
3. Live cycle: next run arrives, confidence updates.
4. Reveal truth: IMD rain map shows the forecast busted.
5. Scorecard: our model vs calibrated ensemble spread, per system with counts.
6. Security moment: edit a number in a card → verify page turns red.
Pick the event from data where a bust really happened; never stage with synthetic data.

**Likely judge questions (prepare answers):** Why this bust definition? How do you separate bias from true busts? Do you beat ensemble spread, by how much, with what CI? What about cyclones with only ~35 events? Is the probability calibrated? What happens with NCUM data / without it? How would forecasters use it in a shift? Why not a better forecast instead? How is it secured against fake alerts? What if inputs are missing (fail-safe)?

## 17. Open questions
1. NCMRWF NCUM/NEPS hindcasts + DA innovation access (request sent?).
2. Final product name.
3. Compute/storage for GEFSv12 downloads (college server / cloud credits).
4. Exact bust quantile and floors (validate 0.90–0.95 on M1 data).
5. Survey-of-India-compliant shapefile source for IMD subdivisions and districts.
6. Confirm SIH idea-submission deadline and SPOC nomination for SIH26079.

## 18. Key references
Rodwell et al. 2013 (BAMS, forecast busts) · Scher & Messori 2018 (QJRMS, ML forecast uncertainty) · Delle Monache et al. 2013 + Deep Analog (analog ensembles) · Rajeevan et al. 2010 (active/break) · NCUM forecast errors (Clim. Dyn. 2018) · GraphCast ISM biases (2026) · GEFSv12 reforecast (MWR 2022) · WeatherBench 2 · Falling monsoon depression frequency (Sci. Rep. 2013) · IMD end-of-season reports · OASIS CAP v1.2 · CERT-In Directions 2022.

Links: [NCUM errors](https://link.springer.com/article/10.1007/s00382-018-4428-4) · [GraphCast ISM](https://arxiv.org/html/2607.11905) · [GFS NIO cyclones](https://www.sciencedirect.com/science/article/pii/S2225603222000030) · [Heat-wave ERP](https://www.nature.com/articles/s41598-019-45430-6) · [Rodwell 2013](https://journals.ametsoc.org/view/journals/bams/94/9/bams-d-12-00099.1.xml) · [MCS busts](https://www.mdpi.com/2073-4433/10/11/681) · [Deep Analog](https://arxiv.org/html/2103.04530v2) · [Scher & Messori code](https://github.com/sipposip/Predicting-weather-forecast-uncertainty-with-machine-learning) · [WeatherBench 2](https://weatherbench2.readthedocs.io/en/latest/data-guide.html) · [GEFSv12 reforecast](https://noaa-gefs-retrospective.s3.amazonaws.com/Description_of_reforecast_data.pdf) · [IMD 2023 monsoon report](https://internal.imd.gov.in/press_release/20231001_pr_2555.pdf) · [MD decline](https://www.nature.com/articles/srep02989) · [Rajeevan 2010](https://link.springer.com/content/pdf/10.1007/s12040-010-0019-4.pdf) · [IITM active/break](https://www.tropmet.res.in/erpas/files/active_break_selection.php) · [NIO seasonal stats](https://en.wikipedia.org/wiki/North_Indian_Ocean_tropical_cyclone) · [CAP 1.2](https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html) · [NDMA SACHET/CAP](https://ndma.gov.in/Capacity_Building/Ops_Comm/IT_Comm_Project) · [CERT-In 2022](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf) · [IMDLIB](https://imdlib.readthedocs.io/en/latest/)

---

## Appendix A. Competitor landscape (32 SIH26079 projects)
Sources: team PDF (18) + GitHub search (14 new); features from code/README keyword scan with manual checks ("mentioned", not quality). 32 = 18 + 14 before dedup; §3.0 gives the deduped count (27 unique repos, 2 duplicates, 1 unrelated) and the corrected "nobody has" claims. `docs/COMPETITORS.md` has the full per-repo detail for both this pass and the later 18-repo PDF pass (§3.0, final paragraph).
- Data: 11 real (incl. 2 small-scale), 5 mixed, 9 synthetic, 5 frontend/mock, 2 unclear.
- Saturated (≥50%): percentile bust threshold, GBM, calibration, SHAP, map, REST API. Rare: IMD truth (7/32), unseen-pattern/abstain (4/32). **Nobody:** live-observation confidence updates, signed outputs, error decomposition, SEEPS. CAP: 2 as label/doc only.

| Project | Strength | Gap |
|---|---|---|
| Vishwas (CoffeeAurCode/The-Bust-Atlas-of-India) | Real IFS ENS, P95 bust per region/lead/season, transfers to WeatherNext 2, live site | ROC 0.663 vs spread 0.655; ERA5 Z500 truth |
| blazingarrows1525/forecast-bust-detection | WeatherBench 2, XGBoost + isotonic, OOD, AUROC 0.832 vs true ENS 0.807 | +0.025 margin |
| Forecast-Guard AI (Rasika1975/forecast-bust) | IFS + IMD rain, 4,651 cells, analogs from 92k busts | Validation depth unclear |
| Purva-Netra (gdhanushkumar07) | 36 subdivisions, IMD truth, q50/q90, 5 similar cases, Hindi, offline PWA | No held-out results yet |
| Sanket (Bhushan2318/sih-main) | Real GEFS+ERA5, P90, replay of real busts, live demo | Mixed real/synthetic |
| vedantthamke01/Forecast_Bust_AI | LightGBM+isotonic, leakage gate, run revisions | 25-station grid |
| FORTRESS (AdarshSingh4455) | Analogues, OOD, trust horizon | One region, 12 dates |
| Veyra v1/v3 | 6 hazard heuristics, abstention, CAP doc | Experimental, unverified |
| AtmosGuard (anuj-sharma7) | Spread + multi-model + jumpiness | Day 3–7 only |
| Others (VortexXAI, BustWatch, VayuDrishti, AeroBust, …) | UI ideas, what-if, fixed thresholds | Mostly synthetic or fixed mm thresholds |

## Appendix B. Science review checklist (geography + meteorology)
| # | Issue raised | Resolution in this doc |
|---|---|---|
| G1 | Relative bust hides error-prone areas and lead decay | §7.6 two outputs |
| G2 | Rain zero-inflated, heavy-tailed, double penalty | §7.2 SEEPS, floors, IMD categories, FSS |
| G3 | 1.5° cannot resolve Ghats/Himalaya | §5.2 0.25°, conservative regrid, static terrain features |
| G4 | Truth unreliable in hills, islands, ocean | §7.5 obs mask, IMERG, best-track |
| G5 | 03 UTC rain day mismatch | §5.3 |
| G6 | Unequal subdivisions | Grid-first + area weights, "N grid cells" (§12) |
| G7 | Busts start upstream | §5.2 upstream domain |
| G8 | System definitions | §6 official IMD / Rajeevan |
| G9 | Small samples, model upgrades | §5.5, §5.7, GEFSv12, model-version feature, LOYO, bootstrap |
| G10 | Calendar seasons mix regimes | §5.3 onset-relative |
| G11 | Live update caveats (spin-up, AWS density) | §13 |
| G12 | Official map boundaries | §5.1, §12 |
| G13 | CAP district mapping | §11 |
| M1 | Bias vs start vs chaos mixed | §7.1, §8.1, §3.1 |
| M2 | Z500 not tropical | §7.2 |
| M3 | Day 7–10 rain has no skill | §7.4, §9 skill horizon |
| M4 | 6-hourly Tmax misses peak | §5.3 |
| M5 | Missing predictability drivers | §8.1 Chaos group |
| M6 | Ensemble under-used | §8.2 framing, §8.1 |
| M7 | Lead-dependent error physics | §8.2 lead bands |
| M8 | Cyclone double counting | §7.2 objects, §8.2 F |
| M9 | Verification standards, leakage | §10 |
| M10 | Better live signals | §13 |
| M11 | Short record, model changes | §5.1 GEFSv12, T3 hindcasts |
| M12 | Novelty over-firing | §8.2 D (EOF space, top 2–3%) |
| M13 | Synoptic language, per-variable | §9, §12 |

## Appendix Z. Coverage matrix (everything discussed → where it lives)
| Discussed item | Section |
|---|---|
| PS line-by-line and 5 outputs | §1 |
| GitHub re-check, 27 repos, corrected claims | §3.0, `docs/COMPETITORS.md` |
| TrustCard schema 1.1 (`issued_at`, `supersedes`, `update_reason`) | §11, §13 |
| `/v1/chain`, `/v1/keys`, `/v1/trust/history` endpoints | §11 |
| Lift metric, truth-source-on-every-score, server-computed indicative flag | §10 |
| 18-repo PDF re-check, 8 MVP-critical features, task backlog | `docs/PLAN.md`, `docs/COMPETITORS.md` |
| Who uses it and why, day in the life, roles | §1A |
| Error Anatomy standout, example card, pitch, what not to lead with | §3.1, §3.3, §3.4 |
| Skill horizon / trust horizon | §7.4, §9 |
| Live Bust Watch / live cycle update | §13 |
| Forecast Black Box (signing, hash chain) | §11, §14 |
| CAP confidence tags, SACHET context | §11 |
| Heavy-rain miss vs false alarm | §7.2, §8.2 |
| Unprecedented-pattern flag | §8.2 D, §9 |
| Low-confidence alert list | §11, §12 |
| Similar past cases as evidence | §8.2 D, §9 |
| System detection (6 PS systems) | §6 |
| IMD truth + IMERG | §5.1, §7.5 |
| Beat calibrated ensemble spread | §10, §16A |
| Line-by-line research findings | §4A |
| Competitor analysis (32 projects) | §3, Appendix A |
| Geography + meteorology review | Appendix B |
| Data sources, GEFSv12 switch, volumes, tiers, verdict | §5.1–5.9 |
| Verified event counts (cyclones, LPS, MDs, breaks) | §5.5 |
| Effective sample size | §5.7 |
| Data-quality traps | §5.6 |
| ML design, lead bands, calibration, monotone constraints | §8 |
| Validation protocol, metrics, REV, bootstrap | §10 |
| API, Trust Card schema | §11 |
| UI views | §12 |
| Security STRIDE, ML security, supply chain, compliance, hygiene | §14 |
| Tech stack | §15 |
| Repo layout, milestones, team split | §16 |
| Risks | §16A |
| Idea PPT, demo script, judge Q&A | §16B |
| Out-of-scope ideas (storm detection, station messaging) | §4 |
| Open questions | §17 |


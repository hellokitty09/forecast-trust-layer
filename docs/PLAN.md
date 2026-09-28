# FTL build plan — from the chat + "all repos 79.pdf"

Status: draft for team approval, 27 Sep 2026. Deadline: idea PPT (M0) on **30 Sep**.
Sources read line by line:
- **Chat part 1**: GitHub re-check of 14 new repos, 27 unique in total
- **Chat part 2**: design package (CLAUDE.md, DESIGN.md, OPEN_QUESTIONS), M0 definition
- **Chat part 3**: §1A "Who uses it, and why"
- **PDF**: 24 pages, 18 repos, Top-8 list, 8 must-have MVP features, MVP flow, USP, "don't spend time on" list

Legend: ✅ built · 🟡 partly built · ❌ not built · 📄 team task (not code)

---

## 0. Current state (27 Sep)

| Area | State |
|---|---|
| Website | Confidence map (schematic tiles), Trust Card panel, Alerts, Error-prone areas (region + grid views), Replay (static files), Scorecard, Verify + Forecast Black Box, Who-it's-for, illustrative demo mode |
| API | health, map, trust, trust/history, alerts, cases, cap, verify, chain, keys, bias, bias/grid, scorecard, feedback; JWT roles public/sdma/forecaster/scientist/admin |
| Integrity | Ed25519-signed, hash-chained cards; audit log; fail-safe UNAVAILABLE rules; 73 tests |
| M0 data | ECMWF IFS HRES: 18 of 28 monsoon months downloaded (stopped at 2020-08 by a units-guard bug). **IMD rainfall: none** (imdpune.gov.in unreachable from this network) |
| M0 results | None yet. Pipeline + figures + web view built and tested on synthetic data only |

---

## 1. Every requirement, traced to its source

### 1.1 From the chat

| ID | Requirement | Source | Status |
|---|---|---|---|
| C1 | Live Bust Watch: update confidence from real observations after issue | Chat 1 edges | 🟡 re-issue history + timeline exist; no obs feed; no dedicated view |
| C2 | Forecast Black Box: every card signed + hash-chained | Chat 1 edges | ✅ |
| C3 | Execution quality: 6 systems, CAP, IMD truth, all India, real held-out, verified | Chat 1 edges | 🟡 structure ready, no real results |
| C4 | All 27 repos in one file with Take / Don't copy / Our edge | Chat 1 offer | 🟡 14 new done; 18 PDF repos to add (§4 T15) |
| C5 | M0: real bias map + skill-horizon chart | Chat 2 | 🟡 blocked on IMD data |
| C6 | M0: one mock Trust Card, clearly illustrative | Chat 2 | 🟡 demo mode; not exported |
| C7 | Thresholds (bust percentile, rain/Tmax floors) confirmed on real data | Chat 2 | ❌ needs M1 |
| C8 | Users + decisions + "not the public" on the site | Chat 3 | ✅ |
| C9 | "Why they'll use it" value measures on the site | Chat 3 | ❌ |
| C10 | "A day in the life" on the site | Chat 3 | ❌ |
| C11 | Analog summary "7 of 11 similar cases busted" | Chat 3 day-in-life | ❌ |
| C12 | District-level CAP ("two most exposed districts") | Chat 3 day-in-life | ❌ needs district boundaries |
| C13 | Replay shows exactly what was said, when, with signature + chain | Chat 3 day-in-life | ❌ replay uses static files |
| C14 | SDMA simplified confidence view | Chat 3 users | ❌ (depends on D5) |
| C15 | Scientist: bust archive with causes | Chat 3 roles | ❌ needs M1 labels |
| C16 | Scientist-only replay | Chat 3 roles | ❌ replay is public |
| C17 | REV curve (disaster-manager value measure) | Chat 3 value table | ❌ |
| C18 | Model-upgrade impact per system (developer value measure) | Chat 3 value table | ❌ |
| C19 | Confirm workflow with a real IMD/NCMRWF forecaster | Chat 3 caveat | 📄 OPEN_QUESTIONS #15 |

### 1.2 From the PDF: the 8 must-have MVP features

| ID | Must-have (PDF p.21–23) | Status | Gap |
|---|---|---|---|
| P1 | **Multi-NWP Disagreement Engine — "MUST STAND OUT"** (ECMWF + GFS/GEFS → disagreement score) | ❌ | No second model's data; nothing on the site |
| P2 | Calibrated 0–100% bust probability per region × Day 1–10 | 🟡 | UI/API ready; model is M2 |
| P3 | Uncertainty range ("expected error 18 mm, likely 10–32 mm", q10/q50/q90) | 🟡 | Card shows quantiles; wording should match the PDF's plain form |
| P4 | WHY: top 3 actual drivers (SHAP + met variables), not generic text | 🟡 | Error Anatomy + reasons exist; no "top 3 drivers" list |
| P5 | Trust Score ("38/100 — do not rely heavily"), combining disagreement, spread, historical error, lead, regime, ML probability | ❌ | Needs D1 (definition) |
| P6 | India Day 1–10 risk map, click region → probability + WHY + uncertainty + models | 🟡 | Map ✅; per-model values ❌ (P1) |
| P7 | Historical analog "resembles 14 cases, 10/14 busted" | 🟡 | Analog table ✅; count summary ❌ (same as C11) |
| P8 | **Real validation**: train 2016–21 / val 2022 / test 2023–24; baseline → ensemble spread → ours; PR-AUC, ROC-AUC, Brier, ECE, false-alarm rate, recall | 🟡 | Scorecard lacks ECE, FAR, recall; split conflicts with DESIGN (D2) |

### 1.3 From the PDF: repo by repo (take → where it lands in FTL)

| # | Repo | Take | Don't copy | Lands in FTL as | Status |
|---|---|---|---|---|---|
| 1 | Synapse Fusion | XGBoost + explainability | Fixed 20 mm bust threshold | Adaptive bust = percentile(region, lead band, season) + floor (DESIGN §7.3) | 🟡 designed, M1 |
| 3 | blazingarrows1525 | Validation, calibration, SHAP, OOD, spatial map | Same XGBoost pipeline / dashboard / bust definition | Beat **calibrated ensemble spread** (their margin only +0.025); add disagreement + uncertainty | 🟡 |
| 6 | xarjunpatil | Docker, tests, Swagger, audit logs, dashboard | UI/architecture alone | **Dockerfile + compose** (DESIGN §15), Swagger ✅, audit ✅ | ❌ Docker |
| 7 | Adit-K06 | Day 1–10, SHAP, Brier, spatial map, historical events, alerts, chronological validation | Competing on accuracy alone (they report ROC 0.971) | P1 disagreement + atmospheric anomaly + uncertainty | ❌ P1 |
| 8 | Veyra | Abstention, trust states, ensemble data, tests | Basic logistic regression, uncalibrated probabilities | UNAVAILABLE / NO_SKILL / OBS_UNCERTAIN / novelty cap ✅; add **data-quality row** on card | 🟡 |
| 9 | Rasika1975 | Calibration, SHAP, analogs (92,474 bust cases), spatial features, metrics | Single-model ECMWF architecture | Same data pairing as our M0 (IFS + IMD) → our edge must be rigor + P1 | 🟡 |
| 11 | Purva-Netra | Trust score, uncertainty, analogs, UX, **multilingual explanation**, "when NOT to trust" | Claiming skill without held-out evidence | ⚠️ **Closest to our product** (36 subdivisions, LightGBM + isotonic, ECMWF + IMD, MapLibre, Trust Ledger). Differentiate with real held-out results, P1, Black Box, Live Bust Watch. **Check whether their Trust Ledger is signed** | 📄 verify |
| 13 | vedantthamke01 | Anti-leakage tests, calibration, dynamic thresholds, **frozen benchmark**, deployment | Same LightGBM pipeline | Leakage test in CI (CLAUDE.md), **locked holdout with hash**, explicit **Day 8–10 validation** | ❌ M1–M2 |
| 14 | SAMBHAV27PARASHAR | What-if simulator, **10-day confidence decay graph**, physical explanations | Synthetic data as proof | Day 1→10 risk profile in Trust Card; what-if only on real trained model (D6) | ❌ |
| 15 | Bhushan2318 | Real data, leakage prevention, **replay demo**, live pipeline, tests | 5 of 31 members, one held-out year, ERA5 rain | Replay from chain (C13); IMD truth; multi-year holdout | ❌ |
| 16 | AeroBust | Lead-day thresholds, calibration, leakage prevention, confidence formula, API | Synthetic metrics as evidence | Bust thresholds per lead band ✅ designed | 🟡 |
| 19 | IAbdullahSlash | Variable selector, Day 1–10 timeline, clickable map, detail panel | Mock data, template "AI" | Our UI already matches | ✅ |
| 21 | VARTA | Disagreement + pattern similarity + past error → one reliability score | Unexplained 0–100 score | Trust Score must show its formula (D1) | ❌ |
| 22 | BustWatch | q10/q50/q90, calibration, confidence maps, reliability metrics, case studies | Synthetic proof | Error range ✅; case studies → replay | 🟡 |
| 23 | AWS Anomaly Platform | Live AWS/observation integration | Frontend without ML | Live Bust Watch obs feed. ⚠️ Our "nobody uses live obs" claim becomes "nobody *demonstrates* it" | ❌ feed |
| 24 | BustGuard | Ensemble spread + **weather regimes** | Dashboard without validation | Show regime/system on card (we have `systems`); spread as a feature | 🟡 |
| — | VayuDrishti | Calibration, exact Shapley, what-if, **Day 1→10 risk profile** | Synthetic training | Same as #14 | ❌ |
| — | Bust Radar / NCMRWF | 3-signal fusion: synoptic fingerprint + k-NN analogs + ensemble spread | Unproven signals | Our model D (analogs) + spread + P1 + past error → calibrated prob | 🟡 designed |

### 1.4 From the PDF: USP and exclusions
- **USP (use verbatim on the site and slides):** "We don't predict the weather better — we tell the forecaster when the existing forecast should NOT be trusted, how likely it is to bust, how uncertain it is, and why."
- **Don't spend MVP time on:** chatbot, mobile app, fancy animations, **blockchain**, huge microservices. So the Black Box is presented as a *signed audit log*, never "blockchain".

---

## 2. Conflicts and decisions (need team answers)

| ID | Question | Options | Recommendation |
|---|---|---|---|
| **D1** | Trust Score definition (P5; VARTA warns against unexplained scores) | (a) `100 × (1 − calibrated bust_prob)`; (b) weighted mix of disagreement, spread, error, lead, regime; (c) no score, only probability + band | **(a)**: one calibrated number with a formula anyone can check; the mix goes *into* the model, not into a hand-weighted score |
| **D2** | Validation split | PDF: train 2016–21 / val 2022 / test 2023–24 · DESIGN: GEFSv12 leave-one-year-out 2000–19, test 2020–24, IFS cross-model 2016–22 | **DESIGN for training** (20 years → enough cyclones/LPS). **Also report the PDF split on IFS for M0/M2**, since judges asked for it. WB2 IFS ends 2022 → 2023–24 test needs ECMWF open data or TIGGE (D3) |
| **D3** | Second model for P1 | GEFSv12 (AWS, same model as training); GFS operational; ICON | **GEFSv12 rain first** (DESIGN §5.1), subdivision/grid aggregates only; run on a server if possible (TB-scale transfer) |
| **D4** | IMD rainfall source | Manual download from imdpune.gov.in; another network; wait | **Manual download** by a team member, 1986–2022 (37 files ≈ 0.9 GB) |
| **D5** | SDMA access to full Trust Cards (OPEN_QUESTIONS #14) | §11 allows; §1A doesn't | Follow §1A: SDMA sees map, alerts, CAP and a simplified card |
| **D6** | What-if simulator (repos 14, VayuDrishti) | Build now / after M2 / never | **After M2**, only on the real trained model |
| **D7** | Multilingual explanations (Purva-Netra) | Hindi templates now / later | **Hindi reason templates after M4**: reasons are fixed templates, so translation is cheap and exact |
| **D8** | Units-guard bug | Check by max value (current) / by typical wet-day value | **Typical value**: median of non-zero values; metres ≈ 0.001–0.05, mm ≈ 1–50. Keep a separate physical ceiling as a warning with a count, not a crash |

---

## 3. Work plan

Each task: what · why (source) · files · acceptance.

### Phase 1: M0 for the 30 Sep PPT (27–29 Sep)

**T1. Fix the units guard** · D8 · `src/ftl/prep/units.py`, `tests/test_m0_pipeline.py`
- Decide units from the median of values > 0; refuse only if clearly mm.
- Values above the physical ceiling are counted and reported in `summary.json`, not silently clipped and not a crash.
- Accept: new tests for "extreme single value in metres passes" and "mm input refused"; 2020-08 downloads.

**T2. Finish the IFS monsoon download** · C5 · `make data-mvp` (JJAS only)
- 10 remaining months, ~30 min at full bandwidth.
- Accept: 28 files, all in `data/provenance/manifest.jsonl`, 0 missing chunks.

**T3. IMD rainfall** · C5, D4 · 📄 team + `make data-imd`
- Team downloads 1986–2022 into `data/raw/imd_rain/`; the command verifies sizes and records checksums.
- Accept: 37 files verified.

**T4. Run M0 and check it** · C5 · `make eval`
- Check the date-alignment result (margin, winning shift) and sanity: Western Ghats wet/dry bias pattern plausible, skill falling with lead.
- Anything suspicious → stop and report, never tune to look good.
- Accept: `reports/grid/rain/monsoon.json`, `reports/m0/summary.json`, 3 PNG figures.

**T5. Show M0 on the site** · C5 · already built (`GridBias.tsx`, `/v1/bias/grid`)
- Browser-check with the real report; fix anything the real data exposes.

**T6. Mock Trust Card for the PPT** · C6 · new `scripts/export_card.py` or demo-mode screenshot
- One card, ILLUSTRATIVE stamp visible, all DESIGN §11 fields, including an error range (P3) and "N of M analogs busted" (P7) placeholders clearly marked.

**T7 (optional). PPT slides** · M0 · 📄 or generated deck
- Problem, users (§1A), USP (§1.4), architecture, real bias + skill figures, validation plan (D2), Security & Trust (fail-safe, signed cards, RBAC), competitor edge.

### Phase 2: PDF must-haves on the website (after 30 Sep, with M1–M2)

**T8. Multi-NWP Disagreement Engine** · P1 (top priority after M0)
- Data: GEFSv12 rain for the same dates as IFS (D3) → `src/ftl/data/gefs.py`, aggregated like IFS.
- Features: `disagreement = |ECMWF − GEFS mean|` scaled by climatology, plus GEFS spread → Chaos group (§8.1).
- API: `models: [{name, value, unit}]` + `disagreement: {score, percentile}` on TrustCard (schema 1.2).
- UI: Trust Card panel "ECMWF 80 mm · GEFS 42 mm → models disagree strongly (top 5%)"; map layer toggle "model disagreement".
- Accept: shown only from real data; empty state until then.

**T9. Trust Score** · P5, D1
- API: `trust_score` derived server-side from calibrated probability; formula shown in UI tooltip and About page.

**T10. Top-3 drivers** · P4
- Grouped SHAP stays (Error Anatomy); add `drivers: [{feature, direction, contribution}]` top 3, shown under "Why".

**T11. Analog summary** · P7, C11
- `/v1/cases` returns `n_similar`, `n_busted`; card shows "resembles 14 past cases — 10 busted".

**T12. Day 1→10 risk profile** · repos 14, VayuDrishti
- New `/v1/profile?init=&region=&variable=` (10 map cells in one call); sparkline in the Trust Card, with the skill horizon marked.

**T13. Scorecard metrics** · P8, C17, C18
- Add ECE, false-alarm rate, recall columns; REV curve chart; model-version comparison per system.
- Empty until real results; server computes nothing.

**T14. USP line** · §1.4 · home page header + Who-it's-for page.

### Phase 3: our unique edges + §1A completion

- **T15. Live Bust Watch page** · C1, repo 23. Cards changed since issue, delta, reason, map toggle. Obs feed = OPEN_QUESTIONS #17.
- **T16. Replay from the chain** · C13, C16, repo 15. `/v1/replay?init=&variable=` from signed history + IMD truth; scientist role.
- **T17. Bust archive** · C15. Past busts with Error Anatomy cause, per system with event counts; needs M1 labels.
- **T18. SDMA simplified view** · C14, D5. Map + alerts + CAP + a 3-line card: confidence, trust horizon, "re-check after next run".
- **T19. "Why they'll use it" + "A day in the life"** · C9, C10 on the Who-it's-for page.
- **T20. Data-quality row on the card** · repo 8. Input source, freshness, obs certainty in one line.

### Phase 4: engineering + docs

- **T21. Docker** · repo 6, DESIGN §15. `Dockerfile` (non-root, read-only), `docker-compose.yml` (api + ui).
- **T22. COMPETITORS.md complete** · C4. Add the 18 PDF repos, Top-8, must-haves, the Purva-Netra warning, and softened claims.
- **T23. DESIGN.md v1.3** · P1 as a headline feature; softened claims (repo 23, Purva-Netra ledger); D1–D8 outcomes; validation split.
- **T24. OPEN_QUESTIONS** · IMD unreachable; calendar JJAS; 38.25/38.5 °N rows dropped; district boundaries for CAP; Purva-Netra ledger check; 2023–24 test data source.

---

## 4. Timeline

| When | Tasks |
|---|---|
| 27 Sep | T1, T2 (download runs in background), T22–T24 docs |
| 28 Sep | T3 (team), T4, T5, T6 |
| 29 Sep | T7 slides; buffer for data problems |
| 30 Sep | PPT submission (📄 SPOC) |
| After | T8 → T13 with M1–M2 data; T15–T21 in parallel |

## 5. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| IMD site stays down | No M0 figures | Team downloads from another network; last resort IMERG as a clearly labelled second truth (needs a NASA Earthdata account the team creates) |
| Real M0 results look weak | Weak slide | Show them honestly with CIs; the pitch is "we tell you when not to trust", and a short skill horizon *supports* that |
| Purva-Netra looks like our product | Judges see overlap | Lead with real held-out numbers, P1, Black Box, Live Bust Watch |
| GEFS download size | P1 delayed | Rain only, aggregates only, server/VM |
| Bandwidth saturation during downloads | Team's internet slow | Run overnight or on a server |

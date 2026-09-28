# Open questions

Add a line whenever a decision is unclear. Do not guess thresholds, event definitions or data semantics.

| # | Question | Owner | Status |
|---|---|---|---|
| 1 | NCMRWF NCUM/NEPS hindcasts + DA innovation access | P1 | open |
| 2 | Final product name | team | open |
| 3 | Compute/storage for GEFSv12 downloads | P1 | open |
| 4 | Bust quantile (0.90–0.95) and absolute floors | P3 | open, decide after M1 |
| 5 | Survey-of-India-compliant IMD subdivision + district shapefiles | P6 | open |
| 6 | SIH idea deadline + SPOC nomination for SIH26079 | lead | open |
| 7 | Canonical `region_id` list for the 36 IMD subdivisions (UI uses `IMD_SUB_*` ids in `ui/src/lib/regions.ts` — backend must match) | P5/P6 | open |
| 8 | Bias map, skill horizon, scorecard and replay had no §11 endpoint | P5/P3 | resolved for bias + scorecard (DESIGN v1.1 `/v1/bias`, `/v1/scorecard`, served from `reports/`). Replay is still static files in `ui/public/reports/replay/` — add `/v1/replay`? |
| 9 | Should `/v1/health` (or a `/v1/config`) expose confidence bands so the UI stops mirroring §11 values in code? | P5 | open |
| 10 | `/v1/verify` response shape: `{valid, signature_valid, chain_valid, detail}` | P5 | resolved — implemented in ftl.serve |
| 11 | Identity provider for JWTs (college SSO / Keycloak / NIC?) — API only verifies HS256 tokens minted by `make token` today; switch to asymmetric (EdDSA/RS256) with the IdP | P5 | open |
| 12 | CAP XML-Signature algorithm: XMLDSig tooling rarely supports Ed25519 — use ECDSA-P256 (signxml) with a separate key? CAP currently embeds the card's Ed25519 signature as a parameter instead | P5 | open |
| 13 | `valid_date` convention for rain: 03→03 UTC rain day means Day-1 from a 00 UTC init ends 03 UTC on init+1. Confirm which calendar date `valid_date` names so issue.py can validate it | P3 | open |
| 14 | **Conflict:** §1A role mapping gives `sdma` only "confidence map, alerts, CAP" (full Trust Cards = forecaster), but §11 lists `/v1/trust` as "forecaster/SDMA". Implemented per §11 (SDMA can open full cards). Should SDMA lose `/v1/trust` and `/v1/trust/history`? | team | open |
| 15 | §1A "day in the life" and SDMA workflow are a realistic assumption, not from an NCMRWF/IMD document. Confirm with a duty forecaster before the idea PPT / finale | P6 | open |
| 16 | Cyclone counts come from Wikipedia seasonal tables (summarising IMD/RSMC); break-spell counts are estimates. Verify against IMD RSMC annual reports and compute break spells with the Rajeevan rule before quoting on slides | P3 | open |
| 17 | Live Bust Watch observation feeds: which real-time sources can we access, and with what latency? (IMD AWS/ARG, IMD–NCMRWF merged satellite-gauge rain, INSAT-3D/3DR) | P1 | open |
| 18 | Season keys for reports are `pre_monsoon / monsoon / post_monsoon / winter` (`configs/base.yaml`); confirm the onset-relative monsoon boundaries per region (§5.3) | P3 | open |
| 19 | TrustCard schema 1.1 (`issued_at`, `supersedes`, `update_reason`) was added for Live Bust Watch. Team sign-off? | P5 | open |
| 20 | DESIGN v2.0 merge (27 Sep) added **Fractions Skill Score** (neighbourhood metric, §7.2) as a rain score. Not implemented in `src/ftl/labels/skill.py` / `ftl.eval.m0` yet — SEEPS only so far. Add for M1, or drop from §7.2? | P4 | open |
| 21 | §5.8 data tiers (T0–T3) and §16 milestones (M0–M6) both exist; confirm they map cleanly onto each other (e.g. is T1 delivered inside M1, or is it a separate slice?) before the team plans sprints | lead | open |
| 22 | **Resolved (27 Sep):** `imdpune.gov.in` was unreachable from this network for the IMD 0.25° rain download. User supplied `Rainfall_IMD_1901_2023.zip` (real IMD gridded rain, NetCDF, 1901–2023) directly — extracted to `data/raw/imd_rain/`, all 123 years verified (`ftl.data.imd_rain`). M0 truth data is no longer blocked. IFS HRES forecast download still incomplete (only Jun/Jul/Aug 2016–2022 partial; Sep missing for all years) — resume `make data-mvp` when ready | P1 | resolved (truth data); forecast download pending |

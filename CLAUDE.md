# CLAUDE.md — SIH26079 Forecast Trust Layer

Read `docs/DESIGN.md` before any task. It is the source of truth. If this file and DESIGN.md disagree, DESIGN.md wins; flag the conflict.

## What we are building
A **forecast-trust layer** on top of existing NWP forecasts (not a weather model). For each region × variable × lead day 1–10 it outputs: skill horizon, calibrated bust probability + range, **Error Anatomy** (bias / uncertain start / chaotic weather), synoptic-language reasons, similar past cases, observation certainty. Served as signed Trust Cards via API + dashboard + CAP XML.
**Who it is for (DESIGN.md §1A):** primary users are the NCMRWF/IMD **duty forecaster** (decides warning colour and wording each cycle) and the NCMRWF **model developer** (decides what to fix in the model). Secondary: NDMA/SDMA disaster managers via CAP. **Not** the general public, who get only a rounded read-only map. FTL is decision support and never issues or suppresses an official warning. Build every feature for one of these users and one of their decisions; if you can't name both, don't build it.
PS: SIH 2026 · SIH26079 · MoES / NCMRWF · "AI-Based Forecast Bust Detection for Medium-Range Weather Forecasts".

## Hard rules (never break)
1. **Never fabricate data or metrics.** No synthetic data in any reported number. Illustrative values must carry `"illustrative": true` and be labelled in UI.
2. **No leakage.** A feature may only use information available at forecast initialization time (`init_time`). Every feature has a timestamp; `tests/test_leakage.py` must pass.
3. **Units and time:** all internal time in **UTC**; rain in **mm**; temperature in **°C**; pressure in **hPa**. IFS/ERA5 precipitation arrives in **metres** → convert. Rain day = **03 UTC → 03 UTC** (IMD convention).
4. **Fail-safe:** missing / invalid / out-of-range input → output `status: "UNAVAILABLE"`. **Never** default to high confidence.
5. **No pickle / joblib for models.** Save LightGBM as native text (or ONNX). Verify SHA-256 from `models/manifest.json` before loading.
6. **Splits by time only** (leave-one-year-out). Never random-split rows.
7. **Never store raw global fields.** Stream → crop → aggregate → Parquet.
8. Secrets only via environment / vault. Nothing secret in git (`gitleaks` runs in CI).
9. Official Survey-of-India-compliant boundaries only for any India map.
10. Keep the repo private until submission.

## Conventions
- Python 3.11, `uv` lockfile, `ruff` + `mypy --strict` on `src/`, `pytest`.
- Package: `src/ftl/` (Forecast Trust Layer). Config in `configs/*.yaml`; no magic numbers in code — thresholds live in config.
- Gridded data: `xarray` + `dask` + `zarr`. Tables: Parquet + DuckDB.
- Every module has a `README.md` stub stating inputs, outputs, and which DESIGN.md section it implements.
- Seeds fixed (`configs/base.yaml: seed`). Log runs to MLflow.
- Small PRs, one module at a time, tests with each PR.

## Commands
```
make setup        # uv sync, pre-commit install
make data-mvp     # M0: WeatherBench2 IFS 0.25° India + IMD rain
make features     # build feature store
make train        # train all models (LOYO)
make eval         # validation pack → reports/
make api          # FastAPI on :8000
make ui           # dashboard on :5173
make test         # unit + leakage + unit-conversion + security tests
make audit        # pip-audit, npm audit, bandit, gitleaks, trivy
```

## When unsure
Ask, or write the question into `docs/OPEN_QUESTIONS.md`. Do not guess thresholds, event definitions, or data semantics.

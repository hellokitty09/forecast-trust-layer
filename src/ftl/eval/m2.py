"""M2 v0: first real LightGBM models — Model B (quantile) + Model C (bust classifier), DESIGN §8.2.

    uv run --extra pipeline python -m ftl.eval.m2

Scope (see configs/labels.yaml m2, and the module docstrings in ftl.features.groups /
ftl.models.bust_clf): a single time-based split — train 2016-2021, test 2022 — on the only months
complete for every one of those years (June, July). Only the Bias feature group exists; Start and Chaos
are not built because we don't have ensemble spread, a second model, or mode indices yet. No per-system
or per-lead-band split. This is a first, honestly-scoped model, not the full DESIGN §8 system.

Outputs:
    reports/scorecard.json          FTL vs climatology vs lead-only baselines, block-bootstrap CIs
    models/bust_clf.txt              LightGBM text model (+ models/manifest.json, SHA-256)
    models/quantile_q{10,50,90}.txt  LightGBM text models
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import xarray as xr
import yaml
from pydantic import BaseModel
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score

from ftl.config import REPO_ROOT
from ftl.data.config import load_data_config
from ftl.data.imd_rain import land_mask, load_years
from ftl.features.groups import bias_group, train_fold_bias
from ftl.labels.busts import bust_label, fit_threshold
from ftl.labels.skill import seeps_climatology, seeps_scores
from ftl.models import bust_clf, quantile_gbm
from ftl.models.common import block_bootstrap_metric, save_booster
from ftl.prep.align import best_shift, load_ifs, obs_for_forecast, on_imd_cells
from ftl.prep.units import check_rain_mm

SOURCE = "ECMWF IFS HRES 0.25°, 00 UTC runs (WeatherBench 2)"
TRUTH = "IMD 0.25° gridded daily rainfall"


class BustSettings(BaseModel):
    quantile: float
    rain_floor_mm: float


class M2Settings(BaseModel):
    train_years: list[int]
    test_years: list[int]
    months: list[int]
    bust: BustSettings
    monotone_bias_feature: bool
    bootstrap_n_boot: int
    lightgbm: dict[str, int | float]


def _config(config_dir: Path) -> tuple[M2Settings, dict[str, int], int, tuple[int, int], float]:
    with (config_dir / "labels.yaml").open(encoding="utf-8") as f:
        y = yaml.safe_load(f)
    with (config_dir / "base.yaml").open(encoding="utf-8") as f:
        base = yaml.safe_load(f)
    m0 = y["m0"]
    clim = m0["seeps_climatology_years"]
    return (
        M2Settings.model_validate(y["m2"]),
        dict(y["bootstrap"]),
        int(base["seed"]),
        (int(clim[0]), int(clim[1])),
        float(m0["dry_threshold_mm"]),
    )


def _month_of_init(inits: pd.DatetimeIndex, lead_days: np.ndarray) -> np.ndarray:
    """Month of the *valid* date (init + lead - 1 day), matching the month convention used for SEEPS climatology."""
    base = inits.normalize().values[:, None]
    valid = base + (lead_days[None, :] - 1) * np.timedelta64(1, "D")
    return pd.DatetimeIndex(valid.ravel()).month.values.reshape(len(inits), len(lead_days))


def run(config_dir: Path, root: Path = REPO_ROOT) -> dict[str, Any]:
    dcfg = load_data_config(config_dir)
    m2, boot_cfg, seed, clim_years, dry_mm = _config(config_dir)
    ifs_root = root / dcfg.paths.interim / "ifs_hres"
    imd_root = root / dcfg.imd_rain.dir

    all_years = sorted(set(m2.train_years) | set(m2.test_years))
    obs_all = load_years(imd_root, all_years, dcfg.imd_rain.missing_value)
    obs_clim = load_years(imd_root, list(range(clim_years[0], clim_years[1] + 1)), dcfg.imd_rain.missing_value)
    mask = land_mask(obs_all) & land_mask(obs_clim)
    check_rain_mm(obs_all.where(mask), dcfg.rain_mm_day.max_physical, "IMD eval")

    def stack(da: xr.DataArray) -> xr.DataArray:
        out: xr.DataArray = (
            da.stack(cell=("lat", "lon")).where(mask.stack(cell=("lat", "lon")), drop=True).reset_index("cell")
        )
        return out

    obs_all_c, obs_clim_c = stack(obs_all), stack(obs_clim)
    p1, thr = seeps_climatology(obs_clim_c, dry_mm)

    def load_split(years: list[int]) -> xr.DataArray:
        fc = load_ifs(ifs_root, years, m2.months)
        check_rain_mm(fc, dcfg.rain_mm_day.max_physical, f"IFS {years}")
        return on_imd_cells(fc, mask.sel(lat=slice(fc.lat.min(), fc.lat.max())))

    fc_train_c = load_split(m2.train_years)
    fc_test_c = load_split(m2.test_years)
    keep = np.where(obs_all_c.lat.values <= float(fc_train_c.lat.max()) + 1e-6)[0]
    ob_cells = obs_all_c.isel(cell=keep)
    for fcc in (fc_train_c, fc_test_c):
        if not (np.allclose(ob_cells.lat.values, fcc.lat.values) and np.allclose(ob_cells.lon.values, fcc.lon.values)):
            raise ValueError("forecast and observation cells are not in the same order")

    lead_days = np.array([int(x) for x in fc_train_c.lead_day.values])
    if list(lead_days) != [int(x) for x in fc_test_c.lead_day.values]:
        raise ValueError("train/test lead days differ")

    # Shift detected from TRAIN only (test never touches parameter fitting, DESIGN §5.3/§7 leakage rule).
    shift = best_shift(fc_train_c, ob_cells, min_margin=0.02)

    def build(fc_c: xr.DataArray) -> tuple[xr.DataArray, xr.DataArray, np.ndarray]:
        inits = fc_c.init.to_index()
        ob = obs_for_forecast(ob_cells, inits, list(lead_days), shift.shift)
        fcv = fc_c.transpose("init", "lead_day", "cell")
        return fcv, ob, _month_of_init(inits, lead_days)

    fc_train, ob_train, month_train = build(fc_train_c)
    fc_test, ob_test, month_test = build(fc_test_c)

    bias_map = train_fold_bias(fc_train, ob_train)  # (lead_day, cell), TRAIN years only

    def rows(fcv: xr.DataArray, ob: xr.DataArray, months_2d: np.ndarray) -> dict[str, np.ndarray]:
        n_init = fcv.sizes["init"]
        feats = bias_group(ob_cells.lat.values, ob_cells.lon.values, lead_days, months_2d, bias_map)
        seeps = seeps_scores(fcv, ob, p1.isel(cell=keep), thr.isel(cell=keep), dry_mm, (0.1, 0.85)).values
        err = (fcv - ob).values
        feats["_seeps"] = seeps.ravel()
        feats["_abs_err"] = np.abs(err).ravel()
        feats["_residual"] = (err - bias_map.values[None, :, :]).ravel()
        feats["_n_init"] = np.array([n_init])
        return feats

    train = rows(fc_train, ob_train, month_train)
    test = rows(fc_test, ob_test, month_test)

    threshold = fit_threshold(train["_seeps"], m2.bust.quantile)
    bust_train = bust_label(train["_seeps"], train["_abs_err"], threshold, m2.bust.rain_floor_mm)
    bust_test = bust_label(test["_seeps"], test["_abs_err"], threshold, m2.bust.rain_floor_mm)
    feat_keys = ("lat", "lon", "lead_day", "month", "bias")
    ftr, fte = {k: train[k] for k in feat_keys}, {k: test[k] for k in feat_keys}

    lgb_p = m2.lightgbm
    q_params = quantile_gbm.QuantileParams(
        int(lgb_p["num_leaves"]),
        float(lgb_p["learning_rate"]),
        int(lgb_p["n_estimators"]),
        int(lgb_p["min_child_samples"]),
        seed,
    )
    c_params = bust_clf.ClfParams(
        int(lgb_p["num_leaves"]),
        float(lgb_p["learning_rate"]),
        int(lgb_p["n_estimators"]),
        int(lgb_p["min_child_samples"]),
        seed,
    )

    q_models = quantile_gbm.fit(ftr, train["_residual"], q_params)
    q_pred = quantile_gbm.predict(q_models, fte)
    clf_model = bust_clf.fit(ftr, bust_train, c_params, m2.monotone_bias_feature)
    prob_ftl = bust_clf.predict_proba(clf_model, fte)

    valid = np.isfinite(bust_test)
    y_test = bust_test[valid].astype(int)
    n_events = int(y_test.sum())

    train_valid = np.isfinite(bust_train)
    clim_rate = float(bust_train[train_valid].mean())
    prob_clim = np.full(prob_ftl.shape, clim_rate)

    lr = LogisticRegression().fit(ftr["lead_day"][train_valid].reshape(-1, 1), bust_train[train_valid])
    prob_lead = lr.predict_proba(fte["lead_day"].reshape(-1, 1))[:, 1]

    obs = ob_test.values.ravel()
    fc_flat = fc_test.values.ravel()
    lo_bound = fc_flat - q_pred[0.9]
    hi_bound = fc_flat - q_pred[0.1]
    coverage90 = float(np.nanmean(((obs >= lo_bound) & (obs <= hi_bound))[valid]))

    inits_test = fc_test.init.to_index()
    n_per_init = int(np.prod(fc_test.shape[1:]))

    def scored(prob: np.ndarray, model_name: str) -> dict[str, Any]:
        p = prob[valid]

        def bss_metric(weights: np.ndarray) -> float:
            w = weights[valid]
            if w.sum() == 0:
                return float("nan")
            bs = np.average((p - y_test) ** 2, weights=w)
            bs_ref = np.average((clim_rate - y_test) ** 2, weights=w)
            return float(1 - bs / bs_ref) if bs_ref > 0 else float("nan")

        def auroc_metric(weights: np.ndarray) -> float:
            w = weights[valid]
            if w.sum() == 0 or len(np.unique(y_test)) < 2:
                return float("nan")
            return float(roc_auc_score(y_test, p, sample_weight=w))

        bss_pt, bss_lo, bss_hi = block_bootstrap_metric(
            inits_test, n_per_init, bss_metric, boot_cfg["block_days"], m2.bootstrap_n_boot, seed
        )
        auc_pt, auc_lo, auc_hi = block_bootstrap_metric(
            inits_test, n_per_init, auroc_metric, boot_cfg["block_days"], m2.bootstrap_n_boot, seed + 1
        )
        return {
            "variable": "rain", "lead_band": "1-10", "system": None, "model": model_name, "n_events": n_events,
            "bss": round(bss_pt, 4), "bss_ci": [round(bss_lo, 4), round(bss_hi, 4)],
            "auroc": round(auc_pt, 4), "auroc_ci": [round(auc_lo, 4), round(auc_hi, 4)],
            "pr_auc": round(float(average_precision_score(y_test, p)), 4),
            "coverage90": round(coverage90, 4) if model_name == "FTL" else None,
        }  # fmt: skip

    rows_out = [
        scored(prob_ftl, "FTL"),
        scored(prob_clim, "climatology"),
        scored(prob_lead, "lead-only"),
    ]

    generated = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    scorecard = {
        "generated_at": generated, "source": SOURCE, "truth": TRUTH, "illustrative": False,
        "split": (
            f"train {m2.train_years[0]}-{m2.train_years[-1]}, test {m2.test_years}, months {m2.months} only "
            f"(v0: single time-based split, not full leave-one-year-out; Bias feature group only). "
            f"Bust = SEEPS > {threshold:.3f} (train-fold {m2.bust.quantile} quantile) AND |error| > {m2.bust.rain_floor_mm} mm. "
            f"IMD/IFS date shift = {shift.shift} day(s), margin {shift.margin:.3f} (fit on train only)."
        ),
        "rows": rows_out,
    }  # fmt: skip
    out_dir = root / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "scorecard.json").write_text(json.dumps(scorecard, ensure_ascii=False, indent=2))

    models_dir = root / "models"
    manifest = models_dir / "manifest.json"
    meta = {"train_years": m2.train_years, "months": m2.months, "feature_order": list(feat_keys), "seed": seed}
    save_booster(clf_model, models_dir / "bust_clf.txt", manifest, kind="bust_classifier", **meta)
    for q, booster in q_models.items():
        save_booster(
            booster,
            models_dir / f"quantile_q{int(q * 100)}.txt",
            manifest,
            kind="quantile_regressor",
            quantile=q,
            **meta,
        )

    for r in rows_out:
        print(f"{r['model']:12s} n={r['n_events']:6d} BSS={r['bss']:.3f} [{r['bss_ci'][0]:.3f},{r['bss_ci'][1]:.3f}]  "
              f"AUROC={r['auroc']:.3f} [{r['auroc_ci'][0]:.3f},{r['auroc_ci'][1]:.3f}]  PR-AUC={r['pr_auc']:.3f}")  # fmt: skip
    print(f"coverage90 (FTL quantile model): {coverage90:.3f}")
    return scorecard


def main(argv: list[str] | None = None) -> int:
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args(argv)
    run(REPO_ROOT / "configs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

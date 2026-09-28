"""M2 v0 unit tests — labels, features, models. All arrays are synthetic test inputs, never reported numbers."""

from __future__ import annotations

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
import pytest
import xarray as xr

from ftl.features.groups import bias_group, train_fold_bias
from ftl.labels.busts import bust_label, fit_threshold
from ftl.models import bust_clf, quantile_gbm
from ftl.models.common import block_bootstrap_metric, load_booster, save_booster

# ---------------------------------------------------------------- labels


def test_fit_threshold_ignores_nan() -> None:
    x = np.array([1.0, 2.0, 3.0, np.nan, 4.0, 5.0])
    assert fit_threshold(x, 0.5) == pytest.approx(np.median([1, 2, 3, 4, 5]))


def test_fit_threshold_rejects_all_nan() -> None:
    with pytest.raises(ValueError, match="no finite"):
        fit_threshold(np.array([np.nan, np.nan]), 0.9)


def test_bust_label_applies_both_conditions_and_never_assumes_false() -> None:
    seeps = np.array([2.0, 2.0, 0.1, np.nan, 2.0])
    err = np.array([20.0, 5.0, 20.0, 20.0, np.nan])
    label = bust_label(seeps, err, threshold=1.0, floor_mm=10.0)
    assert label[0] == 1.0  # over threshold and over floor
    assert label[1] == 0.0  # over threshold, under floor
    assert label[2] == 0.0  # under threshold
    assert np.isnan(label[3])  # seeps missing
    assert np.isnan(label[4])  # error missing


# ---------------------------------------------------------------- features


def test_train_fold_bias_is_mean_error_over_init_only() -> None:
    fc = xr.DataArray(np.array([[[2.0, 4.0]], [[6.0, 8.0]]]), dims=("init", "lead_day", "cell"))
    ob = xr.DataArray(np.array([[[1.0, 1.0]], [[1.0, 1.0]]]), dims=("init", "lead_day", "cell"))
    bias = train_fold_bias(fc, ob)
    assert bias.dims == ("lead_day", "cell")
    np.testing.assert_allclose(bias.values, [[3.0, 5.0]])  # mean of (1,5) and (3,7)


def test_bias_group_broadcasts_and_keeps_month_lead_dependence() -> None:
    lat, lon = np.array([10.0, 20.0]), np.array([70.0, 80.0])
    lead_days = np.array([1, 2])
    months_2d = np.array([[6, 7], [6, 7]])  # 2 inits x 2 leads; lead 2 crosses into July for both
    bias_map = xr.DataArray(np.array([[0.5, -0.5], [1.0, -1.0]]), dims=("lead_day", "cell"))
    feats = bias_group(lat, lon, lead_days, months_2d, bias_map)
    assert feats["lat"].shape == (2 * 2 * 2,)
    # row order is (init, lead, cell) raveled; first init, lead=1, both cells:
    assert list(feats["bias"][:2]) == [0.5, -0.5]
    assert list(feats["month"][:2]) == [6, 6]
    assert list(feats["month"][2:4]) == [7, 7]  # lead 2 -> July, distinct from lead 1's June


# ---------------------------------------------------------------- models


def _toy_features(n: int, rng: np.random.Generator) -> dict[str, np.ndarray]:
    return {
        "lat": rng.uniform(10, 30, n).astype("float32"),
        "lon": rng.uniform(70, 90, n).astype("float32"),
        "lead_day": rng.integers(1, 11, n).astype("float32"),
        "month": rng.integers(6, 8, n).astype("float32"),
        "bias": rng.normal(0, 5, n).astype("float32"),
    }


def test_bust_classifier_monotone_in_bias() -> None:
    rng = np.random.default_rng(0)
    n = 4000
    feats = _toy_features(n, rng)
    # ground truth genuinely increasing in |bias|, so a real fit should recover the constraint easily
    prob_true = 1 / (1 + np.exp(-(np.abs(feats["bias"]) - 5)))
    bust = (rng.random(n) < prob_true).astype(float)
    p = bust_clf.ClfParams(num_leaves=15, learning_rate=0.1, n_estimators=50, min_child_samples=20, seed=0)
    model = bust_clf.fit(feats, bust, p, monotone_bias=True)
    base = dict(feats)
    lo, hi = dict(base), dict(base)
    lo["bias"] = np.full(n, 20.0, dtype="float32")
    hi["bias"] = np.full(n, 40.0, dtype="float32")
    p_lo, p_hi = bust_clf.predict_proba(model, lo), bust_clf.predict_proba(model, hi)
    assert np.all(p_hi >= p_lo - 1e-9)  # larger bias never predicts a lower bust probability


def test_bust_classifier_drops_unlabelled_rows() -> None:
    rng = np.random.default_rng(1)
    feats = _toy_features(500, rng)
    bust = np.full(500, np.nan)
    bust[:100] = (rng.random(100) < 0.5).astype(float)
    p = bust_clf.ClfParams(15, 0.1, 20, 10, 0)
    bust_clf.fit(feats, bust, p, monotone_bias=False)  # must not raise despite 400 NaN rows


def test_quantile_models_are_ordered() -> None:
    rng = np.random.default_rng(2)
    feats = _toy_features(3000, rng)
    residual = feats["bias"] * 0.5 + rng.normal(0, 3, 3000)
    p = quantile_gbm.QuantileParams(15, 0.1, 60, 20, 0)
    models = quantile_gbm.fit(feats, residual, p)
    pred = quantile_gbm.predict(models, feats)
    assert np.mean(pred[0.1] <= pred[0.5]) > 0.95  # q10 should be at or below q50 almost everywhere
    assert np.mean(pred[0.5] <= pred[0.9]) > 0.95


# ---------------------------------------------------------------- persistence (hard rule 5)


def test_save_and_load_booster_is_text_not_pickle(tmp_path: Path) -> None:
    rng = np.random.default_rng(3)
    feats = _toy_features(500, rng)
    bust = (rng.random(500) < 0.3).astype(float)
    p = bust_clf.ClfParams(10, 0.1, 20, 10, 0)
    model = bust_clf.fit(feats, bust, p, monotone_bias=False)
    path, manifest = tmp_path / "clf.txt", tmp_path / "manifest.json"
    digest = save_booster(model, path, manifest, kind="test")
    assert path.read_text().startswith("tree\n") or "num_class" in path.read_text()  # LightGBM's own text format
    entries = json.loads(manifest.read_text())
    assert entries["clf.txt"]["sha256"] == digest
    loaded = load_booster(path, manifest)
    assert isinstance(loaded, lgb.Booster)


def test_load_booster_refuses_tampered_file(tmp_path: Path) -> None:
    rng = np.random.default_rng(4)
    feats = _toy_features(200, rng)
    bust = (rng.random(200) < 0.3).astype(float)
    p = bust_clf.ClfParams(10, 0.1, 10, 10, 0)
    model = bust_clf.fit(feats, bust, p, monotone_bias=False)
    path, manifest = tmp_path / "clf.txt", tmp_path / "manifest.json"
    save_booster(model, path, manifest)
    path.write_text(path.read_text() + "\n# tampered")
    with pytest.raises(ValueError, match="SHA-256"):
        load_booster(path, manifest)


def test_load_booster_refuses_unlisted_file(tmp_path: Path) -> None:
    (tmp_path / "manifest.json").write_text("{}")
    with pytest.raises(ValueError, match="not in"):
        load_booster(tmp_path / "nope.txt", tmp_path / "manifest.json")


# ---------------------------------------------------------------- bootstrap


def test_block_bootstrap_metric_matches_point_estimate_for_a_constant() -> None:
    inits = pd.date_range("2020-06-01", periods=21)
    point, lo, hi = block_bootstrap_metric(
        inits, n_per_init=3, metric_fn=lambda w: 7.0, block_days=7, n_boot=20, seed=0
    )
    assert point == 7.0 and lo == 7.0 and hi == 7.0


def test_block_bootstrap_metric_weights_repeated_blocks_correctly() -> None:
    """A block drawn twice must contribute weight 2, not be collapsed to a boolean mask (weight 1)."""
    inits = pd.date_range("2020-06-01", periods=14)  # two 7-day blocks
    seen_weights = []

    def metric_fn(w: np.ndarray) -> float:
        seen_weights.append(w.copy())
        return float(w.sum())

    block_bootstrap_metric(inits, n_per_init=1, metric_fn=metric_fn, block_days=7, n_boot=200, seed=0)
    # two draws from {block0, block1}: possible per-row weights are 0, 1 or 2 depending on how many
    # times that row's block was drawn. Weight 2 must appear at least once across 200 replicates,
    # proving repeats are counted rather than collapsed to a boolean mask.
    all_weights = np.concatenate(seen_weights[1:])  # skip the point-estimate call (all ones)
    assert set(np.unique(all_weights)) <= {0.0, 1.0, 2.0}
    assert 2.0 in all_weights

"""M0 data-quality traps (DESIGN §5.6): units, missing ≠ 0, alignment / lead off-by-one, file layout, bootstrap, SEEPS.

All arrays here are synthetic test inputs, never reported numbers.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import xarray as xr

from ftl.data.imd_rain import LAT, LON, ImdFileError, land_mask, read_year
from ftl.eval.bootstrap import block_ids, bootstrap_mean
from ftl.labels.skill import horizon, seeps_scores
from ftl.prep.align import best_shift, obs_for_forecast
from ftl.prep.units import UnitError, check_rain_mm, rain_m_to_mm

# ---------------------------------------------------------------- units


def test_metres_to_mm() -> None:
    da = xr.DataArray([0.0, 0.0105, 0.374, np.nan])
    mm = rain_m_to_mm(da, max_mm=1500, negative_tol_mm=0.1)
    assert np.allclose(mm.values[:3], [0, 10.5, 374]) and np.isnan(mm.values[3])  # NaN stays NaN, never 0
    assert mm.attrs["units"] == "mm"


def test_refuses_input_already_in_mm() -> None:
    with pytest.raises(UnitError):
        rain_m_to_mm(xr.DataArray([0.0, 12.0, 374.0]), max_mm=1500, negative_tol_mm=0.1)


def test_packing_noise_zeroed_but_real_negatives_fail() -> None:
    assert float(rain_m_to_mm(xr.DataArray([-1e-7, 0.01]), 1500, 0.1).min()) == 0.0
    with pytest.raises(UnitError):
        rain_m_to_mm(xr.DataArray([-0.001, 0.01]), 1500, 0.1)  # -1 mm


def test_physical_range_check() -> None:
    check_rain_mm(xr.DataArray([0.0, 250.0]), 1500, "ok")
    with pytest.raises(UnitError):
        check_rain_mm(xr.DataArray([0.0, 5000.0]), 1500, "too big")


# ---------------------------------------------------------------- IMD file layout


def _imd_file(tmp: Path, year: int, fill: float = 1.0, days: int | None = None) -> Path:
    n = days or (366 if year % 4 == 0 else 365)
    arr = np.full((n, LAT.size, LON.size), fill, dtype="<f4")
    arr[:, 0, 0] = -999.0  # outside India
    arr[:, 5, 7] = 0.0  # boundary cell reported as 0 all year
    p = tmp / f"Rainfall_ind{year}_rfp25.grd"
    arr.tofile(p)
    return p


def test_imd_reader_layout_and_missing(tmp_path: Path) -> None:
    da = read_year(_imd_file(tmp_path, 2020), 2020, -999.0)
    assert da.sizes == {"date": 366, "lat": 129, "lon": 135}
    assert str(da.date.values[0])[:10] == "2020-01-01" and str(da.date.values[-1])[:10] == "2020-12-31"
    assert np.isnan(da.values[0, 0, 0]) and da.values[0, 1, 1] == 1.0  # -999 → NaN, not 0
    m = land_mask(da)
    assert not bool(m[0, 0]) and not bool(m[5, 7]) and bool(m[1, 1])


def test_imd_reader_rejects_wrong_size(tmp_path: Path) -> None:
    p = _imd_file(tmp_path, 2021, days=364)
    with pytest.raises(ImdFileError):
        read_year(p, 2021, -999.0)


# ---------------------------------------------------------------- alignment / lead off-by-one


def _obs(dates: pd.DatetimeIndex, values: np.ndarray) -> xr.DataArray:
    return xr.DataArray(
        values,
        dims=("date", "cell"),
        coords={"date": dates, "lat": ("cell", [20.0, 21.0]), "lon": ("cell", [80.0, 80.0])},
    )


def test_obs_for_forecast_known_case() -> None:
    dates = pd.date_range("2020-06-01", periods=10)
    obs = _obs(dates, np.arange(20, dtype="float32").reshape(10, 2))
    inits = pd.DatetimeIndex(["2020-06-01T00:00"])
    o = obs_for_forecast(obs, inits, [1, 3], shift=0)
    assert o.sel(lead_day=1).values[0, 0] == obs.sel(date="2020-06-01").values[0]  # Day 1 ↔ same date
    assert o.sel(lead_day=3).values[0, 0] == obs.sel(date="2020-06-03").values[0]  # Day 3 ↔ +2 days
    o1 = obs_for_forecast(obs, inits, [1], shift=1)
    assert o1.values[0, 0, 0] == obs.sel(date="2020-06-02").values[0]


def test_obs_outside_record_is_nan_not_zero() -> None:
    obs = _obs(pd.date_range("2020-06-01", periods=3), np.ones((3, 2), dtype="float32"))
    o = obs_for_forecast(obs, pd.DatetimeIndex(["2020-06-02"]), [5], shift=0)
    assert np.isnan(o.values).all()


def test_best_shift_detects_one_day_offset() -> None:
    rng = np.random.default_rng(0)
    n_days, n_cells = 80, 60
    truth = rng.gamma(0.8, 8.0, size=(n_days + 2, n_cells)).astype("float32")
    dates = pd.date_range("2019-06-01", periods=n_days + 2)
    obs = xr.DataArray(
        truth,
        dims=("date", "cell"),
        coords={"date": dates, "lat": ("cell", np.linspace(10, 30, n_cells)), "lon": ("cell", np.full(n_cells, 80.0))},
    )
    inits = dates[:n_days]
    # forecast for window starting on day X matches IMD label X+1
    fc = xr.DataArray(truth[1 : n_days + 1][:, None, :] + rng.normal(0, 1, (n_days, 1, n_cells)), dims=("init", "lead_day", "cell"),
                      coords={"init": inits, "lead_day": [1]})  # fmt: skip
    r = best_shift(fc, obs, min_margin=0.02)
    assert r.shift == 1 and r.corr[1] > r.corr[0]


def test_best_shift_refuses_ambiguous() -> None:
    rng = np.random.default_rng(1)
    dates = pd.date_range("2019-06-01", periods=40)
    obs = xr.DataArray(
        rng.random((40, 30)),
        dims=("date", "cell"),
        coords={"date": dates, "lat": ("cell", np.linspace(10, 30, 30)), "lon": ("cell", np.full(30, 80.0))},
    )
    fc = xr.DataArray(
        rng.random((38, 1, 30)), dims=("init", "lead_day", "cell"), coords={"init": dates[1:39], "lead_day": [1]}
    )
    with pytest.raises(ValueError, match="ambiguous"):
        best_shift(fc, obs, min_margin=0.2)


# ---------------------------------------------------------------- bootstrap / SEEPS / horizon


def test_bootstrap_mean_and_blocks() -> None:
    inits = pd.date_range("2020-06-01", periods=21)
    assert list(block_ids(inits, 7)) == [0] * 7 + [1] * 7 + [2] * 7
    v = np.arange(21, dtype=float)[:, None]
    v[3, 0] = np.nan
    mean, reps = bootstrap_mean(v, block_ids(inits, 7), 200, seed=0)
    assert mean[0] == pytest.approx(np.nanmean(v))
    assert reps.shape == (200, 1) and reps.min() < mean[0] < reps.max()


def _seeps_inputs(fc_vals: np.ndarray, ob_vals: np.ndarray) -> tuple[xr.DataArray, ...]:
    inits = pd.date_range("2020-07-01", periods=fc_vals.shape[0])
    dims, co = ("init", "lead_day", "cell"), {"init": inits, "lead_day": [1]}
    fc = xr.DataArray(fc_vals[:, None, :], dims=dims, coords=co)
    ob = xr.DataArray(ob_vals[:, None, :], dims=dims, coords=co)
    p1 = xr.DataArray(
        np.full((12, fc_vals.shape[1]), 0.4), dims=("clim_month", "cell"), coords={"clim_month": range(1, 13)}
    )
    thr = xr.DataArray(
        np.full((12, fc_vals.shape[1]), 10.0), dims=("clim_month", "cell"), coords={"clim_month": range(1, 13)}
    )
    return fc, ob, p1, thr


def test_seeps_perfect_is_zero_and_constant_dry_is_about_one() -> None:
    rng = np.random.default_rng(2)
    # obs drawn to match the climatology: p1 = 0.4 dry, wet split 2:1 at 10 mm
    u = rng.random((6000, 1))
    ob = np.where(u < 0.4, 0.0, np.where(u < 0.8, 5.0, 20.0))
    fc, o, p1, thr = _seeps_inputs(ob.copy(), ob)
    assert float(seeps_scores(fc, o, p1, thr, 0.2, (0.1, 0.85)).mean()) == pytest.approx(0.0)
    fc0, o, p1, thr = _seeps_inputs(np.zeros_like(ob), ob)
    assert float(seeps_scores(fc0, o, p1, thr, 0.2, (0.1, 0.85)).mean()) == pytest.approx(1.0, abs=0.05)  # skill ≈ 0


def test_seeps_masks_missing_obs() -> None:
    fc, o, p1, thr = _seeps_inputs(np.array([[1.0], [2.0]]), np.array([[np.nan], [2.0]]))
    s = seeps_scores(fc, o, p1, thr, 0.2, (0.1, 0.85))
    assert np.isnan(s.values[0, 0, 0]) and np.isfinite(s.values[1, 0, 0])


@pytest.mark.parametrize(
    ("lower", "want"),
    [([0.3, 0.2, -0.1, 0.2], 2), ([-0.1, 0.5], None), ([0.3, np.nan, 0.2], 1), ([0.1, 0.1, 0.1], 3)],
)
def test_horizon(lower: list[float], want: int | None) -> None:
    assert horizon(np.array(lower), list(range(1, len(lower) + 1))) == want

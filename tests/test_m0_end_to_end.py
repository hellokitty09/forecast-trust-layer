"""End-to-end M0 run on SYNTHETIC inputs in a temp folder — checks wiring, not science.

The synthetic forecast is built with a known +2 mm/day bias, noise growing with lead, and a known 1-day
IMD date offset, so the pipeline must recover exactly those. Nothing here is a reported number.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
import yaml

from ftl.config import REPO_ROOT
from ftl.data.imd_rain import LAT, LON
from ftl.eval.m0 import run
from ftl.serve.reports import ReportStore
from ftl.serve.schemas import Variable

SHIFT, BIAS = 1, 2.0


def _configs(tmp: Path) -> Path:
    cfg = tmp / "configs"
    shutil.copytree(REPO_ROOT / "configs", cfg)
    labels = yaml.safe_load((cfg / "labels.yaml").read_text())
    labels["m0"].update(eval_years=[2016], seeps_climatology_years=[2014, 2015], min_samples=20)
    labels["bootstrap"].update(n_boot=50)
    (cfg / "labels.yaml").write_text(yaml.safe_dump(labels))
    return cfg


def _imd(tmp: Path, rng: np.random.Generator) -> dict[int, np.ndarray]:
    root = tmp / "data/raw/imd_rain"
    root.mkdir(parents=True)
    land = (LAT[:, None] >= 15) & (LAT[:, None] <= 25) & (LON[None, :] >= 75) & (LON[None, :] <= 85)
    out = {}
    for y in (2014, 2015, 2016):
        n = 366 if y % 4 == 0 else 365
        wet = rng.random((n, LAT.size, LON.size)) < 0.6
        rain = np.where(wet, rng.gamma(0.7, 15.0, (n, LAT.size, LON.size)), 0.0).astype("<f4")
        rain[:, ~land] = -999.0
        rain.tofile(root / f"Rainfall_ind{y}_rfp25.grd")
        out[y] = rain
    return out


def _ifs(tmp: Path, imd2016: np.ndarray, rng: np.random.Generator) -> None:
    root = tmp / "data/interim/ifs_hres"
    root.mkdir(parents=True)
    lat = np.arange(5.0, 38.0 + 1e-9, 0.25)
    lon = np.arange(65.0, 100.0 + 1e-9, 0.25)
    li = np.searchsorted(lat, LAT[LAT <= 38.0])
    lj = np.searchsorted(lon, LON)
    days = pd.date_range("2016-01-01", periods=366)
    for m in (6, 7, 8, 9):
        inits = pd.date_range(f"2016-{m:02d}-01", periods=pd.Period(f"2016-{m:02d}").days_in_month)
        fc = np.zeros((inits.size, 10, lat.size, lon.size), dtype="float32")
        for i, t in enumerate(inits):
            for d in range(1, 11):
                obs = imd2016[days.get_loc(t + pd.Timedelta(days=d - 1 + SHIFT))][LAT <= 38.0]
                noisy = np.where(obs < 0, 0.0, obs + BIAS + rng.normal(0, 3.0 * d, obs.shape))
                fc[i, d - 1][np.ix_(li, lj)] = np.clip(noisy, 0, None)
        da = xr.DataArray(fc, dims=("init", "lead_day", "lat", "lon"),
                          coords={"init": inits, "lead_day": range(1, 11), "lat": lat, "lon": lon},
                          name="tp24", attrs={"units": "mm"})  # fmt: skip
        da.to_dataset().to_netcdf(root / f"tp24_2016-{m:02d}.nc")


def test_m0_end_to_end_recovers_known_offset_and_bias(tmp_path: Path) -> None:
    rng = np.random.default_rng(7)
    imd = _imd(tmp_path, rng)
    _ifs(tmp_path, imd[2016], rng)
    summary = run(_configs(tmp_path), ["monsoon"], root=tmp_path)

    assert summary["alignment"]["imd_date_shift_days"] == SHIFT
    report = json.loads((tmp_path / "reports/grid/rain/monsoon.json").read_text())
    day1 = np.array([np.nan if v is None else v for v in report["bias"][0]], dtype=float)
    assert np.nanmean(day1) > 1.0  # clipping at 0 shrinks the +2 mm bias slightly, but it must be clearly wet
    skill = [v for v in report["all_india"]["skill"]]
    assert skill[0] is not None and skill[0] > skill[-1]  # noise grows with lead → skill falls
    assert report["illustrative"] is False and report["truth"].startswith("IMD")
    # the served schema accepts it
    g = ReportStore(tmp_path / "reports", 30).grid(Variable.rain, "monsoon")
    assert g is not None and g.n_inits == 122
    for name in ("bias_rain_monsoon.png", "skill_horizon_rain_monsoon.png", "skill_curve_rain_monsoon.png"):
        assert (tmp_path / "reports/m0/figures" / name).stat().st_size > 10_000

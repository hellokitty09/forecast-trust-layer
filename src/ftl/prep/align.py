"""Pair IFS forecasts with IMD observations on the IMD land grid (DESIGN §5.3, §5.6 alignment + lead off-by-one).

IFS `tp24[init, d]` covers [init + (d-1) days, init + d days) 00→00 UTC. Which IMD date label covers (almost) the
same 24 h is not assumed: `best_shift` tests shifts of -1/0/+1 days on Day-1 forecasts, where the forecast is
most skilful, and picks the shift with the highest mean spatial correlation. A clear winner is required;
otherwise we stop (OPEN_QUESTIONS #13).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr


def load_ifs(root: Path, years: list[int], months: list[int]) -> xr.DataArray:
    files = [root / f"tp24_{y}-{m:02d}.nc" for y in years for m in months]
    missing = [f.name for f in files if not f.exists()]
    if missing:
        raise FileNotFoundError(f"IFS files missing: {missing[:6]}{' …' if len(missing) > 6 else ''}")
    da = xr.open_mfdataset(files, combine="by_coords")["tp24"].load()
    if da.attrs.get("units") != "mm":
        raise ValueError("IFS tp24 must be in mm")
    return da.sortby("init")


def on_imd_cells(fc: xr.DataArray, mask: xr.DataArray) -> xr.DataArray:
    """Select forecast values at IMD land cells. Both grids are 0.25° on the same lattice → exact point match."""
    cells = mask.stack(cell=("lat", "lon"))
    cells = cells.where(cells, drop=True)
    lat = xr.DataArray(cells["lat"].values, dims="cell")
    lon = xr.DataArray(cells["lon"].values, dims="cell")
    out = fc.sel(lat=lat, lon=lon, method="nearest", tolerance=1e-3)
    return out.assign_coords(lat=("cell", lat.values), lon=("cell", lon.values))


def obs_for_forecast(
    obs_cells: xr.DataArray, inits: pd.DatetimeIndex, lead_days: list[int], shift: int
) -> xr.DataArray:
    """IMD rain arranged like the forecast: obs[init, lead_day, cell] = IMD(date = init.date + lead-1 + shift)."""
    base = inits.normalize()
    dates = np.array([[base[i] + pd.Timedelta(days=ld - 1 + shift) for ld in lead_days] for i in range(len(base))])
    flat = pd.DatetimeIndex(dates.ravel())
    have = obs_cells.date.to_index()
    vals = np.full((flat.size, obs_cells.sizes["cell"]), np.nan, dtype="float32")
    ok = flat.isin(have)
    vals[ok] = obs_cells.sel(date=flat[ok]).values  # dates outside the IMD record stay NaN, never 0
    return xr.DataArray(
        vals.reshape(len(inits), len(lead_days), -1),
        dims=("init", "lead_day", "cell"),
        coords={"init": inits, "lead_day": lead_days, "lat": obs_cells["lat"], "lon": obs_cells["lon"]},
        name="rain_obs",
        attrs={"units": "mm", "imd_date_shift_days": shift},
    )


@dataclass(frozen=True)
class ShiftResult:
    shift: int
    corr: dict[int, float]  # shift → mean spatial correlation on Day 1
    margin: float


def best_shift(fc_cells: xr.DataArray, obs_cells: xr.DataArray, min_margin: float) -> ShiftResult:
    fc1 = fc_cells.sel(lead_day=1)
    inits = fc1.init.to_index()
    corr: dict[int, float] = {}
    for s in (-1, 0, 1):
        ob = obs_for_forecast(obs_cells, inits, [1], s).isel(lead_day=0)
        a = fc1 - fc1.mean("cell")
        b = ob - ob.mean("cell")
        r = (a * b).sum("cell") / np.sqrt((a**2).sum("cell") * (b**2).sum("cell"))
        corr[s] = float(r.mean(skipna=True))
    ranked = sorted(corr, key=lambda k: corr[k], reverse=True)
    margin = corr[ranked[0]] - corr[ranked[1]]
    if margin < min_margin:
        raise ValueError(f"IMD/IFS date alignment ambiguous: correlations {corr} (margin {margin:.3f} < {min_margin})")
    return ShiftResult(shift=ranked[0], corr=corr, margin=margin)

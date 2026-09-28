"""Rain skill vs climatology with SEEPS (DESIGN §7.2, §7.4) and the skill horizon (model A).

Skill = 1 − SEEPS. A constant or climatologically random forecast scores SEEPS = 1 in expectation
(Rodwell et al. 2010), so skill ≤ 0 means "no useful skill". The SEEPS climatology (dry probability p1 and
the light/heavy threshold) comes from IMD years before the evaluation period, per grid cell and calendar month.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import xarray as xr
from scores.categorical import seeps


def seeps_climatology(obs_cells: xr.DataArray, dry_mm: float) -> tuple[xr.DataArray, xr.DataArray]:
    """Per cell × calendar month: p1 = P(rain ≤ dry_mm); threshold = 2/3 quantile of wet-day rain."""
    month = obs_cells["date"].dt.month
    p1 = (obs_cells <= dry_mm).where(obs_cells.notnull()).groupby(month).mean("date")
    wet = obs_cells.where(obs_cells > dry_mm)
    thr = wet.groupby(month).quantile(2 / 3, dim="date").drop_vars("quantile")
    return p1.rename(month="clim_month"), thr.rename(month="clim_month")


def seeps_scores(
    fc: xr.DataArray,
    ob: xr.DataArray,
    p1: xr.DataArray,
    thr: xr.DataArray,
    dry_mm: float,
    p1_valid: tuple[float, float],
) -> xr.DataArray:
    """Per-sample SEEPS (init, lead_day, cell); NaN where obs missing or climatology outside p1_valid."""
    valid_month = xr.DataArray(
        (fc.init.to_index().normalize().values[:, None] + (fc.lead_day.values[None, :] - 1) * np.timedelta64(1, "D")),
        dims=("init", "lead_day"),
    )
    m = xr.DataArray(
        pd.DatetimeIndex(valid_month.values.ravel()).month.values.reshape(valid_month.shape), dims=("init", "lead_day")
    )
    p1_s = p1.sel(clim_month=m)
    thr_s = thr.sel(clim_month=m)
    s = seeps(
        fc, ob, p1_s, thr_s,
        dry_light_threshold=dry_mm, mask_clim_extremes=True,
        lower_masked_value=p1_valid[0], upper_masked_value=p1_valid[1],
        preserve_dims=["init", "lead_day", "cell"],
    )  # fmt: skip
    out: xr.DataArray = s.where(ob.notnull() & fc.notnull())
    return out


def horizon(lower: np.ndarray, lead_days: list[int]) -> int | None:
    """Last lead d with a positive bootstrap lower bound on every lead 1..d; None = no useful skill."""
    h = None
    for d, lb in zip(lead_days, lower, strict=True):
        if not np.isfinite(lb) or lb <= 0:
            break
        h = d
    return h

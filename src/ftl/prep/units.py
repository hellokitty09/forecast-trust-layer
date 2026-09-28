"""Unit handling for rain (hard rule 3): everything internal is mm/day. Fail loudly, never guess."""

from __future__ import annotations

import numpy as np
import xarray as xr

M_TO_MM = 1000.0


class UnitError(ValueError):
    pass


def rain_m_to_mm(da: xr.DataArray, max_mm: float, negative_tol_mm: float) -> xr.DataArray:
    """Convert an accumulated-rain field from metres to mm, with range checks before and after.

    Values in metres must be < max_mm/1000; anything larger means the input was not metres (e.g. already mm)
    and we refuse rather than guess. Tiny negatives from GRIB packing (> -negative_tol_mm) become 0;
    larger negatives are an error. NaN stays NaN — missing is never turned into 0 (DESIGN §5.6).
    """
    vmax = float(da.max(skipna=True))
    if vmax > max_mm / M_TO_MM:
        raise UnitError(f"max {vmax:g} too large for metres of daily rain — input units are not metres")
    mm = da * M_TO_MM
    vmin = float(mm.min(skipna=True))
    if vmin < -negative_tol_mm:
        raise UnitError(f"rain {vmin:g} mm is negative beyond packing noise")
    mm = mm.where(~((mm < 0) & (mm >= -negative_tol_mm)), 0.0)
    mm.attrs = {**da.attrs, "units": "mm"}
    return mm


def check_rain_mm(da: xr.DataArray, max_mm: float, name: str) -> None:
    """Physical-range check on a field that should already be mm/day."""
    vmin, vmax = float(da.min(skipna=True)), float(da.max(skipna=True))
    if not np.isfinite(vmax) or vmin < 0 or vmax > max_mm:
        raise UnitError(f"{name}: rain outside [0, {max_mm}] mm/day (min {vmin:g}, max {vmax:g})")

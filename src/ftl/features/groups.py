"""Feature groups (DESIGN §8.1). Only the **Bias** group is built here.

Start (run-to-run jump, analysis differences, DA innovations) and Chaos (ensemble spread, multi-model
disagreement, modes, derived meteorology) both need data we don't have yet: IFS HRES is a single
deterministic run (no ensemble spread), and there is no second model, no BSISO/ENSO/IOD feed, and no
consecutive-cycle history downloaded. Building those groups from nothing would mean inventing signal, so
they are left out rather than faked (hard rule 1). Error Anatomy therefore cannot be shown for this v0
model — it would trivially show ~100% bias, which looks like an analysis but isn't one. Not implemented
until Start/Chaos features exist (see docs/OPEN_QUESTIONS.md).
"""

from __future__ import annotations

import numpy as np
import xarray as xr


def train_fold_bias(fc_train: xr.DataArray, ob_train: xr.DataArray) -> xr.DataArray:
    """Mean (forecast − obs) per (lead_day, cell), from training rows only (DESIGN §7.1)."""
    err = fc_train - ob_train
    return err.mean("init", skipna=True)


def bias_group(
    cells_lat: np.ndarray, cells_lon: np.ndarray, lead_days: np.ndarray, months_2d: np.ndarray, bias_map: xr.DataArray
) -> dict[str, np.ndarray]:
    """Broadcast (lead_day, cell) bias onto every (init, lead_day, cell) row.

    `months_2d` is (n_init, n_lead): the month of the *valid* date, which can differ from the init's own
    month once the lead is long enough to cross a month boundary — it must not be collapsed to a single
    month per init. `bias_map` must come from `train_fold_bias` on training years only — the same map is
    reused, unchanged, for held-out rows (that's what makes it leakage-safe rather than a per-row lookup).
    Returns flat per-row arrays: lat, lon, lead_day, month, bias.
    """
    n_init, n_lead = months_2d.shape
    n_cell = len(cells_lat)
    lat = np.broadcast_to(cells_lat, (n_init, n_lead, n_cell))
    lon = np.broadcast_to(cells_lon, (n_init, n_lead, n_cell))
    lead = np.broadcast_to(lead_days[None, :, None], (n_init, n_lead, n_cell))
    month = np.broadcast_to(months_2d[:, :, None], (n_init, n_lead, n_cell))
    bias = np.broadcast_to(bias_map.values[None, :, :], (n_init, n_lead, n_cell))
    return {
        "lat": lat.ravel().astype("float32"),
        "lon": lon.ravel().astype("float32"),
        "lead_day": lead.ravel().astype("float32"),
        "month": month.ravel().astype("float32"),
        "bias": bias.ravel().astype("float32"),
    }

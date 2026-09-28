"""Block bootstrap by forecast date (DESIGN §10): errors persist for days, so resample whole blocks of dates."""

from __future__ import annotations

import numpy as np
import pandas as pd


def block_ids(inits: pd.DatetimeIndex, block_days: int) -> np.ndarray:
    days = (inits.normalize() - inits.normalize().min()).days.to_numpy()
    _, ids = np.unique(days // block_days, return_inverse=True)
    return ids


def bootstrap_mean(values: np.ndarray, blocks: np.ndarray, n_boot: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Mean over axis 0 and its bootstrap replicates.

    values: (n_init, ...) with NaN for missing. Returns (mean[...], replicates[n_boot, ...]).
    Each replicate resamples blocks with replacement and takes the NaN-aware mean of all their values.
    """
    nb = int(blocks.max()) + 1
    flat = values.reshape(values.shape[0], -1)
    ok = np.isfinite(flat)
    sums = np.zeros((nb, flat.shape[1]))
    counts = np.zeros((nb, flat.shape[1]))
    np.add.at(sums, blocks, np.where(ok, flat, 0.0))
    np.add.at(counts, blocks, ok.astype(float))
    rng = np.random.default_rng(seed)
    w = rng.multinomial(nb, np.full(nb, 1.0 / nb), size=n_boot).astype(float)  # (n_boot, nb) block weights
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = sums.sum(0) / counts.sum(0)
        reps = (w @ sums) / (w @ counts)
    shape = values.shape[1:]
    return mean.reshape(shape), reps.reshape((n_boot, *shape))

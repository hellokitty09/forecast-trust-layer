"""Bust label (DESIGN §7.3): residual_score > P_q(train fold) AND abs_error > floor.

`P_q` is fit once, on training rows only, and applied unchanged to held-out rows — the threshold is a
number learned from training data, not something recomputed per fold at evaluation time, so nothing about
the test period leaks into it.
"""

from __future__ import annotations

import numpy as np


def fit_threshold(residual_score_train: np.ndarray, quantile: float) -> float:
    """Pooled quantile of the training residual score. NaN rows (missing fc/obs) are ignored, not zeroed."""
    finite = residual_score_train[np.isfinite(residual_score_train)]
    if finite.size == 0:
        raise ValueError("no finite training residual scores to fit a threshold on")
    return float(np.quantile(finite, quantile))


def bust_label(residual_score: np.ndarray, abs_error_mm: np.ndarray, threshold: float, floor_mm: float) -> np.ndarray:
    """True/False per row; NaN wherever residual_score or abs_error is NaN (never assumed False)."""
    label = (residual_score > threshold) & (abs_error_mm > floor_mm)
    return np.where(np.isfinite(residual_score) & np.isfinite(abs_error_mm), label, np.nan)

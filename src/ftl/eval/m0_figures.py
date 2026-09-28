"""M0 figures for the idea PPT. Drawn only from a computed report; no boundary lines (hard rule 9)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.axes import Axes
from matplotlib.colors import BoundaryNorm, ListedColormap, TwoSlopeNorm
from matplotlib.figure import Figure

BIAS_DAYS = (1, 3, 5, 10)


def _grid(report: dict[str, Any], values: list[Any]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    lat = np.array(report["cells"]["lat"], dtype=float)
    lon = np.array(report["cells"]["lon"], dtype=float)
    v = np.array([np.nan if x is None else x for x in values], dtype=float)
    lats, lons = np.unique(lat), np.unique(lon)
    g = np.full((lats.size, lons.size), np.nan)
    g[np.searchsorted(lats, lat), np.searchsorted(lons, lon)] = v
    return lons, lats, g


def _footer(fig: Figure, report: dict[str, Any]) -> None:
    yrs = report["eval_years"]
    fig.text(
        0.01, 0.01,
        f"Forecast: {report['source']}  ·  Truth: {report['truth']}  ·  {yrs[0]}–{yrs[-1]}, "
        f"{report['season']} ({report['n_inits']} runs)  ·  IMD grid cells only, no boundaries drawn",
        fontsize=7, color="#555",
    )  # fmt: skip


def _cell_map(ax: Axes, lons: np.ndarray, lats: np.ndarray, g: np.ndarray, **kw: Any) -> Any:
    ax.set_facecolor("#f2f2f2")
    m = ax.pcolormesh(lons, lats, g, shading="nearest", **kw)
    ax.set_aspect("equal")
    ax.set_xticks([]), ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)
    return m


def draw(report: dict[str, Any], out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    season, leads = report["season"], report["lead_days"]
    paths: list[Path] = []

    # 1 — systematic bias maps
    days = [d for d in BIAS_DAYS if d in leads]
    grids = [_grid(report, report["bias"][leads.index(d)]) for d in days]
    finite = np.concatenate([g[np.isfinite(g)] for _, _, g in grids])
    lim = float(np.nanpercentile(np.abs(finite), 98)) if finite.size else 1.0
    fig, axes = plt.subplots(1, len(days), figsize=(4 * len(days), 4.6), dpi=200)
    for ax, d, (lons, lats, g) in zip(np.atleast_1d(axes), days, grids, strict=True):
        m = _cell_map(ax, lons, lats, g, cmap="BrBG", norm=TwoSlopeNorm(0, -lim, lim))
        ax.set_title(f"Day {d}", fontsize=11)
    cb = fig.colorbar(m, ax=axes, orientation="horizontal", fraction=0.05, pad=0.04, extend="both")
    cb.set_label("Mean forecast − observed rain (mm/day)   ·   brown = forecast too dry, green = too wet")
    fig.suptitle(f"Where the forecast is systematically wrong — rain, {season}", fontsize=13)
    _footer(fig, report)
    p = out_dir / f"bias_rain_{season}.png"
    fig.savefig(p, bbox_inches="tight")
    plt.close(fig)
    paths.append(p)

    # 2 — skill horizon map
    hz = [0 if h is None else h for h in report["horizon_day"]]
    lons, lats, g = _grid(report, hz)
    cmap = ListedColormap(["#bdbdbd", *plt.get_cmap("viridis")(np.linspace(0.05, 0.95, 10))])
    norm = BoundaryNorm(np.arange(-0.5, 11.5, 1), cmap.N)
    fig, ax = plt.subplots(figsize=(6.4, 6.4), dpi=200)
    m = _cell_map(ax, lons, lats, g, cmap=cmap, norm=norm)
    cb = fig.colorbar(m, ax=ax, ticks=range(0, 11), fraction=0.046, pad=0.02)
    cb.ax.set_yticklabels(["no skill", *[f"Day {d}" for d in range(1, 11)]])
    ax.set_title(f"Skill horizon — last useful lead day, rain, {season}", fontsize=12)
    _footer(fig, report)
    p = out_dir / f"skill_horizon_rain_{season}.png"
    fig.savefig(p, bbox_inches="tight")
    plt.close(fig)
    paths.append(p)

    # 3 — all-India skill curve with bootstrap CI
    c = report["all_india"]
    x = np.array(c["lead_days"])

    def f(k: str) -> np.ndarray:
        return np.array([np.nan if v is None else v for v in c[k]], dtype=float)

    fig, ax = plt.subplots(figsize=(7, 4.2), dpi=200)
    ax.fill_between(
        x,
        f("lower"),
        f("upper"),
        color="#0f766e",
        alpha=0.18,
        label=f"{int(report['ci'] * 100)}% CI (block bootstrap by date)",
    )
    ax.plot(x, f("skill"), "-o", color="#0f766e", lw=2, ms=4, label="All-India SEEPS skill (1 − SEEPS)")
    ax.axhline(0, color="#c2413b", lw=1)
    ax.text(x[-1], 0, "  no skill", va="bottom", ha="right", color="#c2413b", fontsize=8)
    if c["horizon_day"]:
        ax.axvline(c["horizon_day"], color="#555", ls="--", lw=1)
        ax.text(c["horizon_day"], ax.get_ylim()[1], f" horizon: Day {c['horizon_day']}", va="top", fontsize=8)
    ax.set_xticks(x)
    ax.set_xlabel("Lead day")
    ax.set_ylabel("Skill vs climatology")
    ax.set_title(f"How far ahead is the rain forecast useful? — India, {season}", fontsize=12)
    ax.legend(fontsize=8, frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    _footer(fig, report)
    p = out_dir / f"skill_curve_rain_{season}.png"
    fig.savefig(p, bbox_inches="tight")
    plt.close(fig)
    paths.append(p)
    return paths

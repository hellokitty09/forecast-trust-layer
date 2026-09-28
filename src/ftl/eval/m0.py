"""M0: IFS HRES vs IMD rain → systematic-bias map + SEEPS skill horizon (DESIGN §16 M0, §7.1, §7.4).

    uv run --extra pipeline python -m ftl.eval.m0

Inputs : data/interim/ifs_hres/tp24_YYYY-MM.nc (ftl.data.wb2_hres), IMD yearly binaries (ftl.data.imd_rain)
Outputs: reports/grid/rain/<season>.json   gridded bias + skill + horizon on IMD land cells (served by /v1/bias/grid)
         reports/m0/summary.json            alignment test, samples, years, settings
         reports/m0/figures/*.png           figures for the idea PPT (no boundary lines — hard rule 9)

Only seasons whose months are all downloaded are computed; the rest are listed as skipped.
Grid-level only: subdivision aggregation waits for official boundaries (OPEN_QUESTIONS #5).
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import xarray as xr
import yaml
from pydantic import BaseModel

from ftl.config import REPO_ROOT
from ftl.data.config import load_data_config
from ftl.data.imd_rain import land_mask, load_years
from ftl.eval.bootstrap import block_ids, bootstrap_mean
from ftl.labels.skill import horizon, seeps_climatology, seeps_scores
from ftl.prep.align import best_shift, load_ifs, obs_for_forecast, on_imd_cells
from ftl.prep.units import check_rain_mm

SOURCE = "ECMWF IFS HRES 0.25°, 00 UTC runs (WeatherBench 2)"
TRUTH = "IMD 0.25° gridded daily rainfall"


class M0Settings(BaseModel):
    eval_years: list[int]
    seeps_climatology_years: tuple[int, int]
    dry_threshold_mm: float
    seeps_p1_valid: tuple[float, float]
    min_samples: int
    alignment_min_margin: float


class BootSettings(BaseModel):
    block_days: int
    n_boot: int
    ci: float


def _labels(config_dir: Path) -> tuple[dict[str, list[int]], M0Settings, BootSettings, int]:
    with (config_dir / "labels.yaml").open(encoding="utf-8") as f:
        y = yaml.safe_load(f)
    with (config_dir / "base.yaml").open(encoding="utf-8") as f:
        seed = int(yaml.safe_load(f)["seed"])
    return y["seasons"], M0Settings.model_validate(y["m0"]), BootSettings.model_validate(y["bootstrap"]), seed


def _r(a: np.ndarray, nd: int = 3) -> list[Any]:
    """JSON-safe rounding; NaN → null (missing is never written as 0)."""
    return [None if not np.isfinite(v) else round(float(v), nd) for v in np.asarray(a).ravel()]


def available_months(root: Path, years: list[int]) -> set[int]:
    return {m for m in range(1, 13) if all((root / f"tp24_{y}-{m:02d}.nc").exists() for y in years)}


def run(config_dir: Path, seasons_wanted: list[str] | None, root: Path = REPO_ROOT) -> dict[str, Any]:
    dcfg = load_data_config(config_dir)
    seasons, st, bs, seed = _labels(config_dir)
    ifs_root = root / dcfg.paths.interim / "ifs_hres"
    have = available_months(ifs_root, st.eval_years)
    todo = {s: m for s, m in seasons.items() if (seasons_wanted is None or s in seasons_wanted) and set(m) <= have}
    skipped = sorted(set(seasons_wanted or seasons) - set(todo))
    if not todo:
        raise SystemExit(f"no season has complete IFS data for {st.eval_years}; downloaded months: {sorted(have)}")

    imd_root = root / dcfg.imd_rain.dir
    y0, y1 = st.seeps_climatology_years
    clim_years = list(range(y0, y1 + 1))
    obs_eval = load_years(imd_root, st.eval_years, dcfg.imd_rain.missing_value)
    obs_clim = load_years(imd_root, clim_years, dcfg.imd_rain.missing_value)
    mask = land_mask(obs_eval) & land_mask(obs_clim)
    for name, o in (("IMD eval", obs_eval), ("IMD climatology", obs_clim)):
        check_rain_mm(o.where(mask), dcfg.rain_mm_day.max_physical, name)

    def stack(da: xr.DataArray) -> xr.DataArray:
        """(date, lat, lon) → (date, cell) on valid land cells, with plain lat/lon coordinates per cell."""
        out: xr.DataArray = (
            da.stack(cell=("lat", "lon")).where(mask.stack(cell=("lat", "lon")), drop=True).reset_index("cell")
        )
        return out

    obs_eval_c, obs_clim_c = stack(obs_eval), stack(obs_clim)
    p1, thr = seeps_climatology(obs_clim_c, st.dry_threshold_mm)
    lat_w = np.cos(np.deg2rad(obs_eval_c.lat.values))

    out_dir = root / "reports"
    generated = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    summary: dict[str, Any] = {
        "generated_at": generated, "source": SOURCE, "truth": TRUTH, "eval_years": st.eval_years,
        "seeps_climatology_years": clim_years, "seasons": {}, "skipped_seasons": skipped,
        "n_cells": int(obs_eval_c.sizes["cell"]),
        "settings": {**st.model_dump(), "bootstrap": bs.model_dump()},
        "notes": [
            "IFS 24 h windows are 00->00 UTC; IMD rain day is 03->03 UTC (3 h offset, DESIGN §5.3).",
            "Grid-level only; subdivision aggregation waits for Survey-of-India-compliant boundaries.",
            "Domain crop 5-38N: IMD cells at 38.25N and 38.5N are outside the forecast crop and excluded.",
        ],
    }  # fmt: skip
    shift_result = None

    for season, months in todo.items():
        fc = load_ifs(ifs_root, st.eval_years, months)
        check_rain_mm(fc, dcfg.rain_mm_day.max_physical, f"IFS {season}")
        fc_c = on_imd_cells(fc, mask.sel(lat=slice(fc.lat.min(), fc.lat.max())))
        keep = np.where(obs_eval_c.lat.values <= float(fc.lat.max()) + 1e-6)[0]  # IMD cells inside the forecast crop
        ob_cells = obs_eval_c.isel(cell=keep)
        if not (
            np.allclose(ob_cells.lat.values, fc_c.lat.values) and np.allclose(ob_cells.lon.values, fc_c.lon.values)
        ):
            raise ValueError("forecast and observation cells are not in the same order")
        if shift_result is None:
            shift_result = best_shift(fc_c, ob_cells, st.alignment_min_margin)
            summary["alignment"] = {
                "imd_date_shift_days": shift_result.shift,
                "day1_mean_spatial_corr": shift_result.corr,
                "margin": shift_result.margin,
            }
        inits = fc_c.init.to_index()
        lead_days = [int(x) for x in fc_c.lead_day.values]
        ob = obs_for_forecast(ob_cells, inits, lead_days, shift_result.shift)
        fcv = fc_c.transpose("init", "lead_day", "cell")

        # --- bias (mean forecast − obs), per cell × lead
        err = (fcv - ob).values
        n = np.isfinite(err).sum(0)
        with np.errstate(invalid="ignore"):
            bias = np.where(n >= st.min_samples, np.nanmean(err, 0), np.nan)

        # --- SEEPS skill + bootstrap lower bound, per cell × lead and all-India
        s = seeps_scores(
            fcv, ob, p1.isel(cell=keep), thr.isel(cell=keep), st.dry_threshold_mm, st.seeps_p1_valid
        ).values
        blocks = block_ids(inits, bs.block_days)
        mean_s, reps = bootstrap_mean(s, blocks, bs.n_boot, seed)
        ns = np.isfinite(s).sum(0)
        skill = np.where(ns >= st.min_samples, 1 - mean_s, np.nan)
        lower = np.where(ns >= st.min_samples, 1 - np.nanquantile(reps, 1 - (1 - bs.ci) / 2, axis=0), np.nan)
        upper = np.where(ns >= st.min_samples, 1 - np.nanquantile(reps, (1 - bs.ci) / 2, axis=0), np.nan)
        hz = [horizon(lower[:, c], lead_days) for c in range(lower.shape[1])]

        w = np.where(np.isfinite(s), lat_w[keep][None, None, :], 0.0)  # area weights, only where SEEPS is defined
        with np.errstate(invalid="ignore"):
            s_all = np.nansum(np.nan_to_num(s) * w, axis=2) / w.sum(axis=2)  # (init, lead)
        mean_all, reps_all = bootstrap_mean(s_all, blocks, bs.n_boot, seed)
        curve: dict[str, Any] = {
            "lead_days": lead_days,
            "skill": _r(1 - mean_all),
            "lower": _r(1 - np.nanquantile(reps_all, 1 - (1 - bs.ci) / 2, axis=0)),
            "upper": _r(1 - np.nanquantile(reps_all, (1 - bs.ci) / 2, axis=0)),
        }
        curve["horizon_day"] = horizon(np.array([np.nan if v is None else v for v in curve["lower"]]), lead_days)

        report = {
            "generated_at": generated, "source": SOURCE, "truth": TRUTH, "illustrative": False,
            "variable": "rain", "unit": "mm/day", "season": season, "months": months, "eval_years": st.eval_years,
            "metric": "SEEPS skill (1 − SEEPS) vs climatology", "ci": bs.ci,
            "n_inits": len(inits), "lead_days": lead_days,
            "cells": {"lat": _r(ob_cells.lat.values, 2), "lon": _r(ob_cells.lon.values, 2)},
            "bias": [_r(bias[i], 2) for i in range(len(lead_days))],
            "n": [[int(v) for v in n[i]] for i in range(len(lead_days))],
            "skill": [_r(skill[i]) for i in range(len(lead_days))],
            "skill_lower": [_r(lower[i]) for i in range(len(lead_days))],
            "skill_upper": [_r(upper[i]) for i in range(len(lead_days))],
            "horizon_day": hz,
            "all_india": curve,
        }  # fmt: skip
        path = out_dir / "grid" / "rain" / f"{season}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False))
        summary["seasons"][season] = {
            "months": months, "n_inits": len(inits), "report": str(path.relative_to(root)),
            "all_india_skill": curve,
            "cells_with_skill_day1": int(np.isfinite(skill[0]).sum()),
            "cells_no_useful_skill_day1": int(sum(h is None for h in hz) - int((~np.isfinite(lower[0])).sum())),
        }  # fmt: skip
        from ftl.eval.m0_figures import draw  # matplotlib only when producing figures

        draw(report, out_dir / "m0" / "figures")
        print(f"{season}: {len(inits)} inits, all-India skill horizon Day {curve['horizon_day']}")

    (out_dir / "m0").mkdir(parents=True, exist_ok=True)
    (out_dir / "m0" / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    return summary


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seasons", nargs="*")
    args = ap.parse_args(argv)
    run(REPO_ROOT / "configs", args.seasons)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

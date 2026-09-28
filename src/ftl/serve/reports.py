"""Validation-pack reports for model developers (DESIGN §1A user 2, §10, §11 /v1/bias and /v1/scorecard).

Files are written by `make eval` into `reports/`. This module only validates and serves them — it never
computes, fills or smooths a metric (hard rule 1). A missing or malformed file is reported as absent.

    reports/bias/<variable>/<season>.json   BiasMap
    reports/skill/<variable>.json           SkillHorizon
    reports/scorecard.json                  Scorecard
    reports/grid/<variable>/<season>.json   GridReport (M0, grid-level bias + skill)
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from ftl.serve.schemas import Variable


class ReportMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")
    generated_at: str
    source: str = Field(min_length=1, description="forecast data, e.g. 'GEFSv12 reforecast 2000–2019'")
    truth: str = Field(min_length=1, description="verifying observations, e.g. 'IMD 0.25° gridded rain'")
    illustrative: bool = False


class BiasMap(ReportMeta):
    variable: Variable
    unit: str
    season: str
    lead_days: list[int]
    regions: dict[str, list[float | None]] = Field(description="region_id → mean error per lead, lead_days order")

    @model_validator(mode="after")
    def _lengths(self) -> BiasMap:
        if any(len(v) != len(self.lead_days) for v in self.regions.values()):
            raise ValueError("every region needs one value per lead day")
        return self


class RegionSkill(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skill: list[float | None]
    lower: list[float | None] = Field(description="bootstrap lower bound")
    horizon_day: int | None = Field(description="last lead with lower bound > 0; null = no useful skill")


class SkillHorizon(ReportMeta):
    variable: Variable
    metric: str
    lead_days: list[int]
    regions: dict[str, RegionSkill]

    @model_validator(mode="after")
    def _lengths(self) -> SkillHorizon:
        n = len(self.lead_days)
        if any(len(r.skill) != n or len(r.lower) != n for r in self.regions.values()):
            raise ValueError("every region needs one skill and one lower bound per lead day")
        return self


class Cells(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lat: list[float]
    lon: list[float]


class SkillCurve(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lead_days: list[int]
    skill: list[float | None]
    lower: list[float | None]
    upper: list[float | None]
    horizon_day: int | None


class GridReport(ReportMeta):
    """Grid-level bias + skill on IMD 0.25° land cells (M0; used until subdivision boundaries exist)."""

    variable: Variable
    unit: str
    season: str
    months: list[int]
    eval_years: list[int]
    metric: str
    ci: float
    n_inits: int
    lead_days: list[int]
    cells: Cells
    bias: list[list[float | None]] = Field(description="[lead][cell] mean forecast − obs")
    n: list[list[int]] = Field(description="[lead][cell] number of forecast/obs pairs")
    skill: list[list[float | None]]
    skill_lower: list[list[float | None]]
    skill_upper: list[list[float | None]]
    horizon_day: list[int | None] = Field(description="per cell; null = no useful skill at Day 1")
    all_india: SkillCurve

    @model_validator(mode="after")
    def _shapes(self) -> GridReport:
        nc, nl = len(self.cells.lat), len(self.lead_days)
        if len(self.cells.lon) != nc or len(self.horizon_day) != nc:
            raise ValueError("cells / horizon_day length mismatch")
        for name in ("bias", "n", "skill", "skill_lower", "skill_upper"):
            rows = getattr(self, name)
            if len(rows) != nl or any(len(r) != nc for r in rows):
                raise ValueError(f"{name} must be [lead][cell]")
        return self


class ScoreRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variable: str
    lead_band: str
    system: str | None
    model: str = Field(description="FTL | climatology | lead-only | ensemble spread (calibrated)")
    n_events: int = Field(ge=0, description="always shown next to the score (DESIGN §5.5)")
    bss: float | None
    bss_ci: tuple[float, float] | None
    auroc: float | None
    auroc_ci: tuple[float, float] | None
    pr_auc: float | None = None
    coverage90: float | None = None
    lift: float | None = Field(None, description="bust rate in flagged region-days ÷ overall bust rate")
    indicative: bool = False  # set by the server, never trusted from the file


class Scorecard(ReportMeta):
    split: str
    rows: list[ScoreRow]
    reliability: dict[str, list[tuple[float, float, int]]] | None = None


R = TypeVar("R", bound=BaseModel)


class ReportStore:
    def __init__(self, root: Path, indicative_below: int) -> None:
        self.root = root
        self.indicative_below = indicative_below

    def _load(self, rel: Path, model: type[R]) -> R | None:
        path = (self.root / rel).resolve()
        if not path.is_relative_to(self.root.resolve()) or not path.is_file():
            return None
        try:
            return model.model_validate_json(path.read_bytes())
        except ValidationError:
            return None

    def bias(self, variable: Variable, season: str) -> BiasMap | None:
        return self._load(Path("bias") / variable.value / f"{season}.json", BiasMap)

    def skill(self, variable: Variable) -> SkillHorizon | None:
        return self._load(Path("skill") / f"{variable.value}.json", SkillHorizon)

    def grid(self, variable: Variable, season: str) -> GridReport | None:
        return self._load(Path("grid") / variable.value / f"{season}.json", GridReport)

    def scorecard(self) -> Scorecard | None:
        sc = self._load(Path("scorecard.json"), Scorecard)
        if sc is None:
            return None
        rows = [r.model_copy(update={"indicative": r.n_events < self.indicative_below}) for r in sc.rows]
        return sc.model_copy(update={"rows": rows})


class BiasResponse(BaseModel):
    variable: Variable
    season: str
    lead: int | None
    bias: BiasMap | None
    skill_horizon: SkillHorizon | None
    status: Literal["OK", "PARTIAL", "NOT_GENERATED"]

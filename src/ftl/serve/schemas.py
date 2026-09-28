"""TrustCard and API schemas — DESIGN.md §11."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Prob = Annotated[float, Field(ge=0.0, le=1.0)]


class Variable(StrEnum):
    rain = "rain"
    tmax = "tmax"
    wind850 = "wind850"
    wind200 = "wind200"


class Status(StrEnum):
    OK = "OK"
    UNAVAILABLE = "UNAVAILABLE"
    NO_SKILL = "NO_SKILL"
    OBS_UNCERTAIN = "OBS_UNCERTAIN"


class Confidence(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class Quantiles(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q10: float
    q50: float
    q90: float

    @model_validator(mode="after")
    def _monotone(self) -> Quantiles:
        if not self.q10 <= self.q50 <= self.q90:
            raise ValueError("quantiles must satisfy q10 <= q50 <= q90")
        return self


class UnitQuantiles(Quantiles):
    unit: Literal["mm", "°C", "m/s", "km"]


class HeavyRain(BaseModel):
    model_config = ConfigDict(extra="forbid")
    p_miss: Prob
    p_false_alarm: Prob


class Anatomy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bias: Prob
    start: Prob
    chaos: Prob


class Novelty(BaseModel):
    model_config = ConfigDict(extra="forbid")
    score: float
    unprecedented: bool


class Provenance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str = Field(min_length=1)
    sha256: str


class Inputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: str = Field(min_length=1)
    sha256: str


class TrustCard(BaseModel):
    """A single region × variable × lead verdict. Unknown fields are rejected."""

    model_config = ConfigDict(extra="forbid")

    card_id: str = Field(min_length=1, max_length=128)
    schema_version: str
    init_time: datetime
    valid_date: date
    lead_day: int = Field(ge=1, le=10)
    region_id: str = Field(min_length=1, max_length=64)
    variable: Variable
    status: Status
    skill_horizon_day: int | None = Field(default=None, ge=0, le=10)
    bust_prob: Prob | None = None
    bust_prob_interval: tuple[Prob, Prob] | None = None
    confidence: Confidence | None = None
    expected_error_mm: Quantiles | None = None
    expected_error: UnitQuantiles | None = None
    heavy_rain: HeavyRain | None = None
    anatomy: Anatomy | None = None
    systems: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    novelty: Novelty | None = None
    obs_certainty: Confidence | None = None
    analog_ids: list[str] = Field(default_factory=list)
    model: Provenance
    inputs: Inputs
    illustrative: bool = False
    # schema 1.1 — Live Bust Watch / Forecast Black Box: when this version was issued, which version it
    # replaces (same init × lead × region × variable), and why it was re-issued. Set by ftl.serve.issue.
    issued_at: datetime | None = None
    supersedes: str | None = Field(default=None, max_length=128)
    update_reason: str | None = Field(default=None, max_length=200)
    prev_hash: str | None = None
    signature: str | None = None

    @field_validator("init_time")
    @classmethod
    def _utc(cls, v: datetime) -> datetime:
        if v.tzinfo is None or v.utcoffset() is None or v.utcoffset().total_seconds() != 0:  # type: ignore[union-attr]
            raise ValueError("init_time must be timezone-aware UTC")
        return v

    @model_validator(mode="after")
    def _consistent(self) -> TrustCard:
        if self.bust_prob_interval is not None:
            lo, hi = self.bust_prob_interval
            if lo > hi:
                raise ValueError("bust_prob_interval lower bound > upper bound")
            if self.bust_prob is not None and not lo <= self.bust_prob <= hi:
                raise ValueError("bust_prob outside bust_prob_interval")
        if self.heavy_rain is not None and self.variable is not Variable.rain:
            raise ValueError("heavy_rain only applies to variable=rain")
        if self.expected_error_mm is not None and self.variable is not Variable.rain:
            raise ValueError("expected_error_mm only applies to variable=rain; use expected_error")
        return self


class ChainStatus(BaseModel):
    """Forecast Black Box: public integrity status of the issued-card chain and the audit log."""

    cards_in_chain: int
    head_hash: str
    chain_intact: bool
    chain_detail: str
    cards_rejected: int
    audit_intact: bool
    audit_detail: str


class CardHistory(BaseModel):
    init_time: datetime
    lead_day: int
    region_id: str
    variable: Variable
    versions: list[dict[str, object]] = Field(description="signed cards, oldest first; the last one is current")


class VerifyResult(BaseModel):
    valid: bool
    signature_valid: bool | None
    chain_valid: bool | None
    detail: str


class FeedbackIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    card_id: str = Field(min_length=1, max_length=128)
    verdict: Literal["confirm", "reject"]
    comment: str = Field(default="", max_length=1000)


class FeedbackOut(BaseModel):
    feedback_id: str
    status: Literal["pending_review"]
    audit_hash: str


class Analog(BaseModel):
    model_config = ConfigDict(extra="forbid")
    analog_id: str
    date: date
    system: str | None = None
    outcome: str
    distance: float | None = None
    busted: bool | None = None  # was this past case itself a bust? null = not recorded, never assumed False


class AlertItem(BaseModel):
    card_id: str
    region_id: str
    region_name: str | None
    variable: Variable
    lead_day: int
    bust_prob: float
    confidence: Confidence
    reasons: list[str]
    illustrative: bool


class AlertsOut(BaseModel):
    init_time: datetime
    threshold: float
    lead_min: int
    alerts: list[AlertItem]
    unavailable: int = Field(
        description="region × lead × variable slots with no valid card — not alerts, but not 'fine' either"
    )


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    data_freshness: datetime | None
    model_version: str | None
    cards_loaded: int
    cards_rejected: int
    signing_enabled: bool
    chain_intact: bool


class PublicKey(BaseModel):
    key_id: str
    alg: Literal["Ed25519"]
    public_key: str
    current: bool

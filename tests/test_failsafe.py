"""Hard rule 4: nothing ever defaults to, or is promoted to, high confidence."""

from typing import Any

import pytest

from ftl.config import Config
from ftl.serve.failsafe import confidence_for, finalize
from ftl.serve.schemas import Confidence, Status, TrustCard

from .conftest import proposal


def fin(cfg: Config, **over: Any) -> TrustCard:
    card = TrustCard.model_validate(dict(proposal(**over), card_id="t", schema_version="1.0"))
    return finalize(card, cfg.serve.confidence, cfg.serve.anatomy_sum_tolerance)


@pytest.mark.parametrize(
    ("p", "want"), [(0.0, "HIGH"), (0.199, "HIGH"), (0.2, "MEDIUM"), (0.499, "MEDIUM"), (0.5, "LOW"), (1.0, "LOW")]
)
def test_bands(cfg: Config, p: float, want: str) -> None:
    assert confidence_for(p, cfg.serve.confidence).value == want


def test_supplied_label_ignored(cfg: Config) -> None:
    assert fin(cfg, confidence="HIGH").confidence is Confidence.LOW


def test_beyond_skill_horizon_is_no_skill(cfg: Config) -> None:
    c = fin(cfg, lead_day=8, skill_horizon_day=7)
    assert c.status is Status.NO_SKILL
    assert c.bust_prob is None and c.confidence is None and c.anatomy is None


def test_missing_probability_is_unavailable(cfg: Config) -> None:
    c = fin(cfg, bust_prob=None, bust_prob_interval=None)
    assert c.status is Status.UNAVAILABLE and c.confidence is None


def test_unprecedented_capped_low(cfg: Config) -> None:
    c = fin(cfg, bust_prob=0.05, bust_prob_interval=[0.01, 0.1], novelty={"score": 0.99, "unprecedented": True})
    assert c.confidence is Confidence.LOW


def test_bad_anatomy_sum_is_unavailable(cfg: Config) -> None:
    assert fin(cfg, anatomy={"bias": 0.5, "start": 0.5, "chaos": 0.5}).status is Status.UNAVAILABLE


def test_non_ok_status_carries_no_numbers(cfg: Config) -> None:
    c = fin(cfg, status="OBS_UNCERTAIN")
    assert c.status is Status.OBS_UNCERTAIN and c.bust_prob is None and c.confidence is None


@pytest.mark.parametrize(
    "over",
    [
        {"bust_prob": 1.2},
        {"lead_day": 11},
        {"bust_prob_interval": [0.7, 0.9]},  # prob outside interval
        {"init_time": "2022-08-12T00:00:00"},  # naive time
        {"variable": "tmax"},  # heavy_rain / expected_error_mm on non-rain
        {"expected_error_mm": {"q10": 5, "q50": 3, "q90": 9}},
        {"unexpected_field": 1},
    ],
)
def test_invalid_inputs_rejected(over: dict[str, Any]) -> None:
    with pytest.raises(ValueError):
        TrustCard.model_validate(dict(proposal(**over), card_id="t", schema_version="1.0"))

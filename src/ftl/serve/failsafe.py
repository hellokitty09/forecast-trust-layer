"""Fail-safe rules applied to every card before it is signed (hard rule 4, DESIGN §9, §11).

The pipeline proposes a card; this module decides what may actually be shown.
Nothing here can raise confidence — every rule only lowers it or removes it.
"""

from __future__ import annotations

from ftl.config import ConfidenceBands
from ftl.serve.schemas import Confidence, Status, TrustCard


def confidence_for(p: float, bands: ConfidenceBands) -> Confidence:
    """DESIGN §11: HIGH < medium_from <= MEDIUM < low_from <= LOW."""
    if p >= bands.low_from:
        return Confidence.LOW
    if p >= bands.medium_from:
        return Confidence.MEDIUM
    return Confidence.HIGH


def _strip(card: TrustCard, status: Status) -> TrustCard:
    return card.model_copy(
        update={
            "status": status,
            "bust_prob": None,
            "bust_prob_interval": None,
            "confidence": None,
            "heavy_rain": None,
            "expected_error_mm": None,
            "expected_error": None,
            "anatomy": None,
            "reasons": [],
        }
    )


def finalize(card: TrustCard, bands: ConfidenceBands, anatomy_tolerance: float) -> TrustCard:
    if card.status is not Status.OK:
        return _strip(card, card.status)

    # Beyond the skill horizon: "No useful skill", never a bust probability (DESIGN §9).
    if card.skill_horizon_day is not None and card.lead_day > card.skill_horizon_day:
        return _strip(card, Status.NO_SKILL)

    if card.bust_prob is None:
        return _strip(card, Status.UNAVAILABLE)

    if card.anatomy is not None:
        total = card.anatomy.bias + card.anatomy.start + card.anatomy.chaos
        if abs(total - 1.0) > anatomy_tolerance:
            return _strip(card, Status.UNAVAILABLE)

    # Confidence is always derived from bust_prob by configured bands; a supplied label is ignored.
    conf = confidence_for(card.bust_prob, bands)
    if card.novelty is not None and card.novelty.unprecedented:
        conf = Confidence.LOW  # history cannot judge this forecast
    return card.model_copy(update={"confidence": conf})

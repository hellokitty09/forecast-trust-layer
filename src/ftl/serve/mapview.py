"""Region confidence map as GeoJSON (DESIGN §11 /v1/map, §12 offline fallback)."""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from ftl.config import Config
from ftl.serve.failsafe import confidence_for
from ftl.serve.schemas import Confidence, Status, Variable
from ftl.serve.store import CardStore

_CAUTION = [Confidence.LOW, Confidence.MEDIUM, Confidence.HIGH]


def round_up(p: float, step: float) -> float:
    """Public tier: coarse probability, rounded towards caution (DESIGN §14)."""
    return min(1.0, round(math.ceil(p / step - 1e-9) * step, 4))


def build_map(
    cfg: Config, store: CardStore, init: datetime, lead: int, variable: Variable, public: bool
) -> dict[str, Any]:
    """One feature per IMD subdivision. Geometry is null until official boundaries exist (rule 9)."""
    features = []
    for region in cfg.regions:
        sc = store.get(init, lead, region.id, variable)
        props: dict[str, Any] = {"region_id": region.id, "name": region.name, "status": Status.UNAVAILABLE.value}
        if sc is not None:
            c = sc.card
            props.update(status=c.status.value, illustrative=c.illustrative, card_id=c.card_id)
            if c.status is Status.OK and c.bust_prob is not None and c.confidence is not None:
                p, conf = c.bust_prob, c.confidence
                if public:
                    p = round_up(p, cfg.serve.public_round_step)
                    conf = min(conf, confidence_for(p, cfg.serve.confidence), key=_CAUTION.index)
                props.update(bust_prob=p, confidence=conf.value)
        features.append({"type": "Feature", "id": region.id, "geometry": None, "properties": props})
    return {
        "type": "FeatureCollection",
        "init_time": init.isoformat().replace("+00:00", "Z"),
        "lead_day": lead,
        "variable": variable.value,
        "tier": "public" if public else "full",
        "features": features,
    }

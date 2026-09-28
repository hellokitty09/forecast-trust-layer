"""CAP 1.2 export of a Trust Card (DESIGN §11).

Confidence travels as <parameter>s: forecastConfidence, bustProbability,
trustHorizonDay, reason. The card's own Ed25519 signature and hash are embedded
as ftlCardSignature / ftlCardHash so a recipient can check them via /v1/verify.
Enveloped XML-Signature is not implemented yet (OPEN_QUESTIONS #12).
"""

from __future__ import annotations

from datetime import UTC, datetime, time

from lxml import etree

from ftl.config import CapConfig
from ftl.serve.schemas import Status
from ftl.serve.store import StoredCard

CAP_NS = "urn:oasis:names:tc:emergency:cap:1.2"


def _cap_time(dt: datetime) -> str:
    # CAP 1.2 dateTime: no "Z", explicit offset, no fractional seconds.
    return dt.astimezone(UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def build_cap(sc: StoredCard, cfg: CapConfig, region_name: str | None, now: datetime | None = None) -> bytes:
    c = sc.card
    now = now or datetime.now(UTC)

    def el(parent: etree._Element, tag: str, text: str | None = None) -> etree._Element:
        e = etree.SubElement(parent, f"{{{CAP_NS}}}{tag}")
        if text is not None:
            e.text = text
        return e

    alert = etree.Element(f"{{{CAP_NS}}}alert", nsmap={None: CAP_NS})  # type: ignore[dict-item]  # default namespace
    el(alert, "identifier", f"ftl-{c.card_id}")
    el(alert, "sender", cfg.sender)
    el(alert, "sent", _cap_time(now))
    el(alert, "status", "Exercise" if c.illustrative else "Actual")
    el(alert, "msgType", "Alert")
    el(alert, "scope", "Restricted")
    el(alert, "restriction", cfg.restriction)
    if c.illustrative:
        el(alert, "note", "ILLUSTRATIVE — placeholder values, not a model output.")

    info = el(alert, "info")
    el(info, "language", "en-IN")
    el(info, "category", "Met")
    el(info, "event", cfg.event)
    el(info, "urgency", "Future")
    el(info, "severity", "Unknown")
    el(info, "certainty", "Unknown")
    el(info, "effective", _cap_time(c.init_time))
    el(info, "onset", _cap_time(datetime.combine(c.valid_date, time(0), tzinfo=UTC)))
    el(info, "senderName", cfg.sender_name)
    area_name = region_name or c.region_id
    if c.status is Status.OK and c.confidence is not None and c.bust_prob is not None:
        headline = f"{c.confidence.value} confidence in Day {c.lead_day} {c.variable.value} forecast — {area_name}"
        desc = (
            f"Probability that the Day {c.lead_day} {c.variable.value} forecast for {area_name} "
            f"(valid {c.valid_date.isoformat()}) is an unusually bad error: {c.bust_prob:.0%}."
        )
    else:
        headline = f"Forecast confidence {c.status.value} — Day {c.lead_day} {c.variable.value}, {area_name}"
        desc = {
            Status.NO_SKILL: "No useful skill at this lead time — do not use this forecast.",
            Status.OBS_UNCERTAIN: "Observations too uncertain here to judge forecast errors.",
            Status.UNAVAILABLE: "Confidence unavailable (missing or invalid input). Do not assume the forecast is reliable.",
            Status.OK: "Confidence unavailable.",
        }[c.status]
    el(info, "headline", headline)
    el(info, "description", desc)

    def param(name: str, value: str) -> None:
        p = el(info, "parameter")
        el(p, "valueName", name)
        el(p, "value", value)

    param("forecastConfidence", c.confidence.value if c.confidence else c.status.value)
    if c.bust_prob is not None:
        param("bustProbability", f"{c.bust_prob:.2f}")
    if c.skill_horizon_day is not None:
        param("trustHorizonDay", str(c.skill_horizon_day))
    for r in c.reasons:
        param("reason", r)
    param("ftlCardHash", sc.hash)
    if c.signature:
        param("ftlCardSignature", c.signature)

    area = el(info, "area")
    el(area, "areaDesc", area_name)
    g = el(area, "geocode")
    el(g, "valueName", cfg.geocode_name)
    el(g, "value", c.region_id)
    return bytes(etree.tostring(alert, xml_declaration=True, encoding="UTF-8", pretty_print=True))

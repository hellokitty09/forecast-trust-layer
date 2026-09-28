"""/v1 routes — DESIGN §11."""

from __future__ import annotations

import base64
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, Response

from ftl.config import Config
from ftl.serve.auth import Principal, Role, current_principal, require
from ftl.serve.cap import build_cap
from ftl.serve.mapview import build_map
from ftl.serve.reports import BiasResponse, GridReport, ReportStore, Scorecard
from ftl.serve.schemas import (
    AlertItem,
    AlertsOut,
    CardHistory,
    ChainStatus,
    Confidence,
    FeedbackIn,
    FeedbackOut,
    Health,
    Inputs,
    Provenance,
    PublicKey,
    Status,
    TrustCard,
    Variable,
    VerifyResult,
)
from ftl.serve.signing import card_hash
from ftl.serve.store import AnalogStore, CardStore, StoredCard

router = APIRouter(prefix="/v1")

Forecaster = Annotated[Principal, Depends(require(Role.forecaster))]
SdmaOrForecaster = Annotated[Principal, Depends(require(Role.sdma, Role.forecaster))]
Scientist = Annotated[Principal, Depends(require(Role.scientist))]
ScientistOrForecaster = Annotated[Principal, Depends(require(Role.scientist, Role.forecaster))]
AnyPrincipal = Annotated[Principal, Depends(current_principal)]


def _cfg(request: Request) -> Config:
    return request.app.state.cfg  # type: ignore[no-any-return]


def _store(request: Request) -> CardStore:
    return request.app.state.store  # type: ignore[no-any-return]


def _init_time(request: Request, init: datetime) -> datetime:
    """init must be UTC and on a model cycle (00/06/12/18) — anything else is rejected, not guessed."""
    cfg = _cfg(request)
    if init.tzinfo is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "init must include a UTC offset, e.g. 2022-08-12T00:00:00Z"
        )
    init = init.astimezone(UTC)
    if init.hour not in cfg.base.cycles_utc or (init.minute, init.second, init.microsecond) != (0, 0, 0):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"init must be on a cycle hour {cfg.base.cycles_utc} UTC"
        )
    return init


def _lead(request: Request, lead: int) -> int:
    ld = _cfg(request).base.lead_days
    if not ld.min <= lead <= ld.max:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"lead must be in {ld.min}..{ld.max}")
    return lead


def _unavailable_card(
    schema_version: str, init: datetime, lead: int, region: str, variable: Variable
) -> dict[str, Any]:
    """Fail-safe stand-in when no valid card exists. Unsigned by design: it asserts nothing."""
    card = TrustCard(
        card_id=f"unavailable:{init:%Y%m%dT%H}:{lead}:{region}:{variable.value}",
        schema_version=schema_version,
        init_time=init,
        valid_date=(init + timedelta(days=lead)).date(),
        lead_day=lead,
        region_id=region,
        variable=variable,
        status=Status.UNAVAILABLE,
        model=Provenance(version="none", sha256=""),
        inputs=Inputs(source="none", sha256=""),
    )
    return card.model_dump(mode="json", exclude_none=True)


# ---------------------------------------------------------------- public


@router.get("/health", response_model=Health)
def health(request: Request) -> Health:
    snap = _store(request).snapshot()
    latest = _store(request).latest()
    keyring = request.app.state.keyring
    ok = snap.chain_intact and keyring.signer is not None and snap.rejected == 0
    return Health(
        status="ok" if ok else "degraded",
        data_freshness=latest.card.init_time if latest else None,
        model_version=latest.card.model.version if latest else None,
        cards_loaded=len(snap.by_id),
        cards_rejected=snap.rejected,
        signing_enabled=keyring.signer is not None,
        chain_intact=snap.chain_intact,
    )


@router.get("/keys", response_model=list[PublicKey])
def keys(request: Request) -> list[PublicKey]:
    """Published Ed25519 verification keys (current + rotated-out)."""
    kr = request.app.state.keyring
    return [
        PublicKey(
            key_id=kid, alg="Ed25519", public_key=base64.b64encode(bytes(vk)).decode(), current=kid == kr.current_key_id
        )
        for kid, vk in kr.verifiers.items()
    ]


@router.get("/map")
def region_map(
    request: Request,
    principal: AnyPrincipal,
    init: datetime,
    lead: Annotated[int, Query()],
    variable: Variable,
) -> JSONResponse:
    """GeoJSON FeatureCollection, one feature per IMD subdivision (public tier: rounded up)."""
    init, lead = _init_time(request, init), _lead(request, lead)
    return JSONResponse(build_map(_cfg(request), _store(request), init, lead, variable, principal.is_public))


@router.get("/chain", response_model=ChainStatus)
def chain(request: Request) -> ChainStatus:
    """Forecast Black Box: is the record of what FTL said, and when, intact?"""
    snap = _store(request).snapshot()
    audit_ok, audit_detail = request.app.state.audit.verify()
    return ChainStatus(
        cards_in_chain=len(snap.hashes),
        head_hash=snap.head,
        chain_intact=snap.chain_intact,
        chain_detail=snap.chain_detail,
        cards_rejected=snap.rejected,
        audit_intact=audit_ok,
        audit_detail=audit_detail,
    )


@router.post("/verify", response_model=VerifyResult)
def verify(request: Request, card: Annotated[dict[str, Any], Body()]) -> VerifyResult:
    """Check a Trust Card's Ed25519 signature and that it sits in the issued hash chain."""
    sig_ok, sig_detail = request.app.state.keyring.verify(card)
    snap = _store(request).snapshot()
    in_chain = card_hash(card) in snap.by_hash
    if not sig_ok:
        detail = sig_detail
    elif not in_chain:
        detail = "signature valid, but this card is not in the issued chain"
    else:
        detail = "signature valid and card found in the issued chain"
    return VerifyResult(valid=sig_ok and in_chain, signature_valid=sig_ok, chain_valid=in_chain, detail=detail)


# ---------------------------------------------------------------- forecaster / SDMA


@router.get("/trust")
def trust(
    request: Request,
    _: SdmaOrForecaster,
    init: datetime,
    lead: Annotated[int, Query()],
    region: Annotated[str, Query(max_length=64)],
    variable: Variable,
) -> JSONResponse:
    cfg = _cfg(request)
    init, lead = _init_time(request, init), _lead(request, lead)
    if region not in cfg.region_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown region")
    sc = _store(request).get(init, lead, region, variable)
    return JSONResponse(sc.raw if sc else _unavailable_card(cfg.serve.schema_version, init, lead, region, variable))


@router.get("/trust/history", response_model=CardHistory)
def trust_history(
    request: Request,
    _: SdmaOrForecaster,
    init: datetime,
    lead: Annotated[int, Query()],
    region: Annotated[str, Query(max_length=64)],
    variable: Variable,
) -> CardHistory:
    """Live Bust Watch: every signed version of one card, oldest first, with when and why it changed."""
    cfg = _cfg(request)
    init, lead = _init_time(request, init), _lead(request, lead)
    if region not in cfg.region_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown region")
    versions = [sc.raw for sc in _store(request).history(init, lead, region, variable)]
    return CardHistory(init_time=init, lead_day=lead, region_id=region, variable=variable, versions=versions)


@router.get("/alerts", response_model=AlertsOut)
def alerts(
    request: Request,
    _: SdmaOrForecaster,
    init: datetime,
    lead_min: Annotated[int | None, Query()] = None,
    threshold: Annotated[float | None, Query(ge=0, le=1)] = None,
) -> AlertsOut:
    cfg = _cfg(request)
    init = _init_time(request, init)
    lead_min = _lead(request, lead_min if lead_min is not None else cfg.serve.alerts.default_lead_min)
    threshold = threshold if threshold is not None else cfg.serve.alerts.default_threshold
    cards = _store(request).cards_for_init(init)
    items = [
        AlertItem(
            card_id=c.card_id,
            region_id=c.region_id,
            region_name=cfg.region_name(c.region_id),
            variable=c.variable,
            lead_day=c.lead_day,
            bust_prob=c.bust_prob,
            confidence=c.confidence,
            reasons=c.reasons,
            illustrative=c.illustrative,
        )
        for c in (sc.card for sc in cards)
        if c.status is Status.OK
        and c.bust_prob is not None
        and c.confidence is not None
        and c.lead_day >= lead_min
        and (c.bust_prob >= threshold or c.confidence is Confidence.LOW)
    ]
    items.sort(key=lambda a: (-a.bust_prob, a.lead_day))
    slots = len(cfg.regions) * len(cfg.base.variables) * (cfg.base.lead_days.max - lead_min + 1)
    usable = sum(1 for sc in cards if sc.card.lead_day >= lead_min and sc.card.status is not Status.UNAVAILABLE)
    return AlertsOut(init_time=init, threshold=threshold, lead_min=lead_min, alerts=items, unavailable=slots - usable)


def _card_or_404(request: Request, card_id: str) -> StoredCard:
    sc = _store(request).by_id(card_id)
    if sc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "card not found")
    return sc


@router.get("/cases/{card_id}")
def cases(request: Request, _: Forecaster, card_id: str) -> JSONResponse:
    sc = _card_or_404(request, card_id)
    analogs: AnalogStore = request.app.state.analogs
    found = analogs.get_many(sc.card.analog_ids)
    return JSONResponse({"card_id": card_id, "cases": [a.model_dump(mode="json", exclude_none=True) for a in found]})


@router.get("/cap/{card_id}.xml")
def cap(request: Request, _: SdmaOrForecaster, card_id: str) -> Response:
    sc = _card_or_404(request, card_id)
    cfg = _cfg(request)
    xml = build_cap(sc, cfg.serve.cap, cfg.region_name(sc.card.region_id))
    return Response(xml, media_type="application/cap+xml")


# ---------------------------------------------------------------- model developer (DESIGN §1A user 2)


def _reports(request: Request) -> ReportStore:
    return request.app.state.reports  # type: ignore[no-any-return]


@router.get("/bias", response_model=BiasResponse, response_model_exclude_none=False)
def bias(
    request: Request,
    _: ScientistOrForecaster,
    variable: Variable,
    season: Annotated[str, Query(max_length=32)],
    lead: Annotated[int | None, Query()] = None,
) -> BiasResponse:
    """Error-prone (bias) map + skill horizon. Values come only from `make eval` output."""
    cfg = _cfg(request)
    if season not in cfg.base.seasons:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"season must be one of {cfg.base.seasons}")
    if lead is not None:
        lead = _lead(request, lead)
    b, sk = _reports(request).bias(variable, season), _reports(request).skill(variable)
    if lead is not None and b is not None:
        # One lead only; a lead the report doesn't cover means no bias data, not zero bias.
        if lead in b.lead_days:
            i = b.lead_days.index(lead)
            b = b.model_copy(update={"lead_days": [lead], "regions": {k: [v[i]] for k, v in b.regions.items()}})
        else:
            b = None
    st = "OK" if b and sk else "PARTIAL" if b or sk else "NOT_GENERATED"
    return BiasResponse(variable=variable, season=season, lead=lead, bias=b, skill_horizon=sk, status=st)


@router.get("/bias/grid", response_model=GridReport)
def bias_grid(
    request: Request,
    _: ScientistOrForecaster,
    variable: Variable,
    season: Annotated[str, Query(max_length=32)],
) -> GridReport:
    """Grid-level bias + SEEPS skill + skill horizon on IMD land cells (M0), from `make eval` output."""
    if season not in _cfg(request).base.seasons:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"season must be one of {_cfg(request).base.seasons}"
        )
    g = _reports(request).grid(variable, season)
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "grid report not generated yet — run `make eval`")
    return g


@router.get("/scorecard", response_model=Scorecard)
def scorecard(request: Request, _: Scientist) -> Scorecard:
    """Per-system / per-lead scores with event counts and CIs. Rows under the event threshold are marked indicative."""
    sc = _reports(request).scorecard()
    if sc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "scorecard not generated yet — run `make eval`")
    return sc


@router.post("/feedback", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
def feedback(request: Request, who: Forecaster, body: FeedbackIn) -> FeedbackOut:
    """Forecaster confirm/reject. Audit-logged; never used for training until reviewed (DESIGN §14)."""
    _card_or_404(request, body.card_id)
    fid = str(uuid.uuid4())
    record = {
        "feedback_id": fid,
        "card_id": body.card_id,
        "verdict": body.verdict,
        "comment": body.comment,
        "sub": who.sub,
        "role": who.role.value,
        "status": "pending_review",
    }
    h = request.app.state.feedback_chain.append("feedback", record)
    request.app.state.audit.append("feedback", {"feedback_id": fid, "feedback_hash": h})
    return FeedbackOut(feedback_id=fid, status="pending_review", audit_hash=h)

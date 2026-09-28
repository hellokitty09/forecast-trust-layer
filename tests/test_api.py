import json
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from lxml import etree

from ftl.serve.auth import Role

from .conftest import INIT, auth, proposal

Issue = Callable[..., list[dict[str, Any]]]
Tok = Callable[..., str]
MAP = {"init": INIT, "lead": 5, "variable": "rain"}
TRUST = {**MAP, "region": "IMD_SUB_ODISHA"}


def test_health_empty_store(client: TestClient) -> None:
    h = client.get("/v1/health").json()
    assert h["status"] == "ok" and h["cards_loaded"] == 0 and h["data_freshness"] is None


def test_security_headers(client: TestClient) -> None:
    r = client.get("/v1/health")
    assert r.headers["content-security-policy"].startswith("default-src 'none'")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "strict-transport-security" in r.headers


def test_map_public_is_rounded_towards_caution(client: TestClient, issue: Issue) -> None:
    issue(proposal(bust_prob=0.12, bust_prob_interval=[0.05, 0.2]))
    fc = client.get("/v1/map", params=MAP).json()
    assert fc["type"] == "FeatureCollection" and fc["tier"] == "public" and len(fc["features"]) == 36
    odisha = next(f for f in fc["features"] if f["id"] == "IMD_SUB_ODISHA")
    assert odisha["geometry"] is None
    assert odisha["properties"]["bust_prob"] == 0.2  # 0.12 rounded up, never down
    assert odisha["properties"]["confidence"] == "MEDIUM"  # recomputed from the rounded value
    others = [f for f in fc["features"] if f["id"] != "IMD_SUB_ODISHA"]
    assert all(f["properties"]["status"] == "UNAVAILABLE" for f in others)


def test_map_full_tier_for_authenticated(client: TestClient, issue: Issue, token: Tok) -> None:
    issue(proposal(bust_prob=0.12, bust_prob_interval=[0.05, 0.2]))
    fc = client.get("/v1/map", params=MAP, headers=auth(token(Role.sdma))).json()
    odisha = next(f for f in fc["features"] if f["id"] == "IMD_SUB_ODISHA")
    assert fc["tier"] == "full" and odisha["properties"]["bust_prob"] == 0.12


def test_input_validation(client: TestClient) -> None:
    assert client.get("/v1/map", params={**MAP, "init": "2022-08-12T03:00:00Z"}).status_code == 422
    assert client.get("/v1/map", params={**MAP, "init": "2022-08-12T00:00:00"}).status_code == 422
    assert client.get("/v1/map", params={**MAP, "lead": 11}).status_code == 422
    assert client.get("/v1/map", params={**MAP, "variable": "snow"}).status_code == 422


def test_trust_requires_role(client: TestClient, token: Tok) -> None:
    assert client.get("/v1/trust", params=TRUST).status_code == 401
    assert client.get("/v1/trust", params=TRUST, headers=auth("garbage")).status_code == 401
    assert client.get("/v1/trust", params=TRUST, headers=auth(token(Role.public))).status_code == 401
    assert client.get("/v1/trust", params=TRUST, headers=auth(token(Role.sdma))).status_code == 200


def test_admin_needs_mfa(client: TestClient, token: Tok) -> None:
    assert client.get("/v1/trust", params=TRUST, headers=auth(token(Role.admin))).status_code == 401
    assert client.get("/v1/trust", params=TRUST, headers=auth(token(Role.admin, mfa=True))).status_code == 200


def test_trust_missing_card_is_unavailable(client: TestClient, token: Tok) -> None:
    card = client.get("/v1/trust", params=TRUST, headers=auth(token(Role.forecaster))).json()
    assert card["status"] == "UNAVAILABLE" and "bust_prob" not in card and "signature" not in card


def test_trust_returns_signed_card_that_verifies(client: TestClient, issue: Issue, token: Tok) -> None:
    issue(proposal())
    card = client.get("/v1/trust", params=TRUST, headers=auth(token(Role.forecaster))).json()
    assert card["confidence"] == "LOW" and card["signature"].startswith("ed25519:")
    v = client.post("/v1/verify", json=card).json()
    assert v == {"valid": True, "signature_valid": True, "chain_valid": True, "detail": v["detail"]}


def test_verify_detects_tampering(client: TestClient, issue: Issue) -> None:
    (card,) = issue(proposal())
    tampered = dict(card, bust_prob=0.05, confidence="HIGH")
    v = client.post("/v1/verify", json=tampered).json()
    assert v["valid"] is False and v["signature_valid"] is False


def test_verify_rejects_body_too_large(client: TestClient) -> None:
    r = client.post(
        "/v1/verify", content=json.dumps({"x": "a" * 300_000}), headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 413


def test_cap_export(client: TestClient, issue: Issue, token: Tok) -> None:
    (card,) = issue(proposal())
    r = client.get(f"/v1/cap/{card['card_id']}.xml", headers=auth(token(Role.sdma)))
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/cap+xml")
    ns = {"c": "urn:oasis:names:tc:emergency:cap:1.2"}
    root = etree.fromstring(r.content)
    params = {
        p.findtext("c:valueName", namespaces=ns): p.findtext("c:value", namespaces=ns)
        for p in root.iterfind(".//c:parameter", ns)
    }
    assert params["forecastConfidence"] == "LOW" and params["bustProbability"] == "0.58"
    assert params["trustHorizonDay"] == "7" and params["ftlCardSignature"] == card["signature"]
    assert root.findtext("c:status", namespaces=ns) == "Exercise"  # illustrative fixture
    assert client.get("/v1/cap/nope.xml", headers=auth(token(Role.sdma))).status_code == 404


def test_feedback_is_audited(client: TestClient, issue: Issue, token: Tok) -> None:
    (card,) = issue(proposal())
    body = {"card_id": card["card_id"], "verdict": "reject", "comment": "LPS moved faster"}
    assert client.post("/v1/feedback", json=body, headers=auth(token(Role.sdma))).status_code == 403
    r = client.post("/v1/feedback", json=body, headers=auth(token(Role.forecaster)))
    assert r.status_code == 201 and r.json()["status"] == "pending_review"


def test_alerts(client: TestClient, issue: Issue, token: Tok) -> None:
    issue(proposal(), proposal(region_id="IMD_SUB_BIHAR", bust_prob=0.1, bust_prob_interval=[0.05, 0.2]))
    out = client.get("/v1/alerts", params={"init": INIT}, headers=auth(token(Role.sdma))).json()
    assert [a["region_id"] for a in out["alerts"]] == ["IMD_SUB_ODISHA"]
    assert out["unavailable"] == 36 * 4 * 10 - 2


def test_keys_published(client: TestClient) -> None:
    (k,) = client.get("/v1/keys").json()
    assert k["alg"] == "Ed25519" and k["current"] is True


def test_cases_returns_busted_flag(client: TestClient, issue: Issue, token: Tok, secrets, cfg) -> None:  # type: ignore[no-untyped-def]
    """Analog.busted (N of M busted, DESIGN §9 / PDF must-have P7) round-trips through /v1/cases."""
    (card,) = issue(proposal(analog_ids=["a1", "a2", "a3"]))
    analogs_path = secrets.data_root / cfg.base.paths.analogs
    analogs_path.parent.mkdir(parents=True, exist_ok=True)
    rows = [
        {
            "analog_id": "a1",
            "date": "2019-08-12",
            "system": "MONSOON_LPS",
            "outcome": "heavy rain missed",
            "busted": True,
        },
        {"analog_id": "a2", "date": "2020-07-03", "outcome": "held up fine", "busted": False},
        {"analog_id": "a3", "date": "2021-08-20", "outcome": "no verdict recorded"},  # busted omitted -> null
    ]
    analogs_path.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    r = client.get(f"/v1/cases/{card['card_id']}", headers=auth(token(Role.forecaster)))
    assert r.status_code == 200
    cases = {c["analog_id"]: c for c in r.json()["cases"]}
    assert cases["a1"]["busted"] is True
    assert cases["a2"]["busted"] is False
    assert cases["a3"].get("busted") is None  # omitted by exclude_none, same as an explicit null

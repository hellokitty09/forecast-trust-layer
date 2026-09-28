"""Live Bust Watch (card history), Forecast Black Box (chain status), and model-developer reports."""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from ftl.config import Config, Secrets
from ftl.serve.auth import Role
from ftl.serve.issue import IssueError

from .conftest import INIT, auth, proposal

Issue = Callable[..., list[dict[str, Any]]]
Tok = Callable[..., str]
KEY = {"init": INIT, "lead": 5, "region": "IMD_SUB_ODISHA", "variable": "rain"}


def test_reissue_records_supersedes_and_reason(client: TestClient, issue: Issue, token: Tok) -> None:
    (first,) = issue(proposal(update_reason="00 UTC cycle"))
    (second,) = issue(
        proposal(bust_prob=0.3, bust_prob_interval=[0.2, 0.4], update_reason="12 UTC cycle: run-to-run jump shrank")
    )
    assert first["supersedes"] is None and first["issued_at"] and first["schema_version"] == "1.1"
    assert second["supersedes"] == first["card_id"]
    hist = client.get("/v1/trust/history", params=KEY, headers=auth(token(Role.forecaster))).json()
    assert [v["card_id"] for v in hist["versions"]] == [first["card_id"], second["card_id"]]
    assert [v["confidence"] for v in hist["versions"]] == ["LOW", "MEDIUM"]
    # the current card is the latest version, and each version still verifies on its own
    cur = client.get("/v1/trust", params=KEY, headers=auth(token(Role.forecaster))).json()
    assert cur["card_id"] == second["card_id"]
    assert client.post("/v1/verify", json=first).json()["valid"] is True


def test_proposal_cannot_forge_chain_fields(issue: Issue) -> None:
    (c,) = issue(proposal(issued_at="2000-01-01T00:00:00Z", supersedes="fake"))
    assert c["supersedes"] is None and not c["issued_at"].startswith("2000")


def test_duplicate_card_id_rejected(issue: Issue) -> None:
    issue(proposal(card_id="dup"))
    with pytest.raises(IssueError):
        issue(proposal(card_id="dup", region_id="IMD_SUB_BIHAR"))


def test_history_requires_role(client: TestClient) -> None:
    assert client.get("/v1/trust/history", params=KEY).status_code == 401


def test_chain_status_public_and_detects_tampering(
    client: TestClient, issue: Issue, secrets: Secrets, cfg: Config
) -> None:
    issue(proposal(), proposal(region_id="IMD_SUB_BIHAR"))
    st = client.get("/v1/chain").json()
    assert st["cards_in_chain"] == 2 and st["chain_intact"] and st["audit_intact"]
    path = secrets.data_root / cfg.base.paths.cards
    lines = path.read_text().splitlines()
    path.write_text(lines[1] + "\n")  # drop the first card
    st = client.get("/v1/chain").json()
    assert st["chain_intact"] is False and st["cards_rejected"] == 1
    assert client.get("/v1/health").json()["status"] == "degraded"


def _write(root: Path, rel: str, obj: dict[str, Any]) -> None:
    p = root / "reports" / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj))


META = {"generated_at": "test", "source": "test fixture", "truth": "test fixture", "illustrative": True}


def test_bias_roles_and_not_generated(client: TestClient, token: Tok) -> None:
    q = {"variable": "rain", "season": "monsoon"}
    assert client.get("/v1/bias", params=q).status_code == 401
    assert client.get("/v1/bias", params=q, headers=auth(token(Role.sdma))).status_code == 403
    r = client.get("/v1/bias", params=q, headers=auth(token(Role.scientist))).json()
    assert r["status"] == "NOT_GENERATED" and r["bias"] is None
    assert (
        client.get("/v1/bias", params={**q, "season": "summer"}, headers=auth(token(Role.scientist))).status_code == 422
    )


def test_bias_serves_report_and_slices_lead(client: TestClient, token: Tok, secrets: Secrets) -> None:
    _write(
        secrets.data_root,
        "bias/rain/monsoon.json",
        {
            **META,
            "variable": "rain",
            "unit": "mm/day",
            "season": "monsoon",
            "lead_days": [1, 2],
            "regions": {"IMD_SUB_ODISHA": [1.5, None]},
        },
    )
    q = {"variable": "rain", "season": "monsoon", "lead": 1}
    r = client.get("/v1/bias", params=q, headers=auth(token(Role.forecaster))).json()
    assert r["status"] == "PARTIAL" and r["bias"]["regions"] == {"IMD_SUB_ODISHA": [1.5]}
    r = client.get("/v1/bias", params={**q, "lead": 7}, headers=auth(token(Role.forecaster))).json()
    assert r["bias"] is None  # lead not in the report ≠ zero bias


def test_malformed_report_is_absent(client: TestClient, token: Tok, secrets: Secrets) -> None:
    _write(secrets.data_root, "bias/rain/monsoon.json", {**META, "variable": "rain"})
    r = client.get(
        "/v1/bias", params={"variable": "rain", "season": "monsoon"}, headers=auth(token(Role.scientist))
    ).json()
    assert r["status"] == "NOT_GENERATED"


def test_scorecard_indicative_is_computed_by_server(client: TestClient, token: Tok, secrets: Secrets) -> None:
    assert client.get("/v1/scorecard", headers=auth(token(Role.scientist))).status_code == 404
    row = {
        "variable": "rain",
        "lead_band": "4-6",
        "system": "CYCLONE",
        "model": "FTL",
        "n_events": 12,
        "bss": 0.1,
        "bss_ci": [0.0, 0.2],
        "auroc": 0.7,
        "auroc_ci": [0.6, 0.8],
        "indicative": False,
    }
    _write(secrets.data_root, "scorecard.json", {**META, "split": "LOYO", "rows": [row, {**row, "n_events": 94}]})
    assert client.get("/v1/scorecard", headers=auth(token(Role.forecaster))).status_code == 403
    rows = client.get("/v1/scorecard", headers=auth(token(Role.scientist))).json()["rows"]
    assert [r["indicative"] for r in rows] == [True, False]


def _grid_report(**over: Any) -> dict[str, Any]:
    g = {**META, "variable": "rain", "unit": "mm/day", "season": "monsoon", "months": [6, 7, 8, 9], "eval_years": [2016],
         "metric": "SEEPS skill", "ci": 0.95, "n_inits": 122, "lead_days": [1, 2],
         "cells": {"lat": [20.0, 20.25], "lon": [80.0, 80.0]},
         "bias": [[1.0, None], [2.0, None]], "n": [[120, 3], [120, 3]],
         "skill": [[0.4, None], [0.2, None]], "skill_lower": [[0.3, None], [0.1, None]], "skill_upper": [[0.5, None], [0.3, None]],
         "horizon_day": [2, None],
         "all_india": {"lead_days": [1, 2], "skill": [0.4, 0.2], "lower": [0.3, 0.1], "upper": [0.5, 0.3], "horizon_day": 2}}  # fmt: skip
    g.update(over)
    return g


def test_bias_grid(client: TestClient, token: Tok, secrets: Secrets) -> None:
    q = {"variable": "rain", "season": "monsoon"}
    assert client.get("/v1/bias/grid", params=q, headers=auth(token(Role.scientist))).status_code == 404
    _write(secrets.data_root, "grid/rain/monsoon.json", _grid_report())
    assert client.get("/v1/bias/grid", params=q).status_code == 401
    r = client.get("/v1/bias/grid", params=q, headers=auth(token(Role.forecaster)))
    assert r.status_code == 200 and r.json()["bias"][0] == [1.0, None]  # missing stays null, never 0


def test_bias_grid_rejects_bad_shapes(client: TestClient, token: Tok, secrets: Secrets) -> None:
    _write(secrets.data_root, "grid/rain/monsoon.json", _grid_report(bias=[[1.0]]))
    r = client.get(
        "/v1/bias/grid", params={"variable": "rain", "season": "monsoon"}, headers=auth(token(Role.scientist))
    )
    assert r.status_code == 404

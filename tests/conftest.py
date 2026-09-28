"""Shared fixtures. All cards here are test fixtures marked illustrative — never reported numbers."""

from __future__ import annotations

import base64
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from nacl.signing import SigningKey
from pydantic import SecretStr

from ftl.config import REPO_ROOT, Config, Secrets, load_config
from ftl.serve.app import create_app
from ftl.serve.audit_chain import AuditChain
from ftl.serve.auth import Role, mint_token
from ftl.serve.issue import Issuer
from ftl.serve.signing import Keyring

INIT = "2022-08-12T00:00:00Z"
JWT_SECRET = "test-secret-" + "x" * 40


def proposal(**over: Any) -> dict[str, Any]:
    p: dict[str, Any] = {
        "init_time": INIT,
        "valid_date": "2022-08-17",
        "lead_day": 5,
        "region_id": "IMD_SUB_ODISHA",
        "variable": "rain",
        "status": "OK",
        "skill_horizon_day": 7,
        "bust_prob": 0.58,
        "bust_prob_interval": [0.41, 0.72],
        "expected_error_mm": {"q10": 4.1, "q50": 11.8, "q90": 31.0},
        "heavy_rain": {"p_miss": 0.34, "p_false_alarm": 0.12},
        "anatomy": {"bias": 0.25, "start": 0.20, "chaos": 0.55},
        "systems": ["MONSOON_LPS"],
        "reasons": ["LPS track spread over central India"],
        "novelty": {"score": 0.41, "unprecedented": False},
        "obs_certainty": "HIGH",
        "analog_ids": [],
        "model": {"version": "test", "sha256": "0" * 64},
        "inputs": {"source": "test-fixture", "sha256": "0" * 64},
        "illustrative": True,
    }
    p.update(over)
    return p


@pytest.fixture
def cfg() -> Config:
    return load_config(REPO_ROOT / "configs")


@pytest.fixture
def seed_b64() -> str:
    return base64.b64encode(bytes(SigningKey.generate())).decode()


@pytest.fixture
def secrets(tmp_path: Path, seed_b64: str) -> Secrets:
    return Secrets(
        signing_key=SecretStr(seed_b64),
        jwt_secret=SecretStr(JWT_SECRET),
        data_root=tmp_path,
        config_dir=REPO_ROOT / "configs",
        _env_file=None,  # type: ignore[call-arg]
    )


@pytest.fixture
def keyring(seed_b64: str) -> Keyring:
    return Keyring.from_env_values(seed_b64, "")


@pytest.fixture
def issue(cfg: Config, keyring: Keyring, secrets: Secrets) -> Callable[..., list[dict[str, Any]]]:
    def _issue(*proposals: dict[str, Any]) -> list[dict[str, Any]]:
        issuer = Issuer(
            cfg, keyring, secrets.data_root / cfg.base.paths.cards, AuditChain(secrets.data_root / cfg.base.paths.audit)
        )
        return issuer.issue_many(list(proposals))

    return _issue


@pytest.fixture
def client(secrets: Secrets, cfg: Config) -> TestClient:
    return TestClient(create_app(secrets, cfg))


@pytest.fixture
def token(cfg: Config) -> Callable[..., str]:
    def _tok(role: Role, mfa: bool = False) -> str:
        return mint_token(JWT_SECRET, cfg.security.jwt, "tester", role, mfa)

    return _tok


def auth(t: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {t}"}

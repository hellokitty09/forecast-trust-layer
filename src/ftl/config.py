"""Configuration: thresholds from configs/*.yaml, secrets from the environment only (hard rule 8)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Paths(BaseModel):
    cards: Path
    analogs: Path
    audit: Path
    feedback: Path
    reports: Path


class LeadDays(BaseModel):
    min: int
    max: int


class BaseConfig(BaseModel):
    seed: int
    paths: Paths
    lead_days: LeadDays
    cycles_utc: list[int]
    variables: list[str]
    seasons: list[str]


class ConfidenceBands(BaseModel):
    medium_from: float = Field(gt=0, lt=1)
    low_from: float = Field(gt=0, lt=1)

    @model_validator(mode="after")
    def _ordered(self) -> ConfidenceBands:
        if not self.medium_from < self.low_from:
            raise ValueError("confidence.medium_from must be < confidence.low_from")
        return self


class AlertsConfig(BaseModel):
    default_threshold: float = Field(ge=0, le=1)
    default_lead_min: int


class CapConfig(BaseModel):
    sender: str
    sender_name: str
    event: str
    restriction: str
    geocode_name: str


class ServeConfig(BaseModel):
    confidence: ConfidenceBands
    public_round_step: float = Field(gt=0, le=1)
    alerts: AlertsConfig
    schema_version: str
    anatomy_sum_tolerance: float = Field(ge=0, lt=1)
    indicative_below: int = Field(gt=0)
    cap: CapConfig


class JwtConfig(BaseModel):
    algorithm: str
    ttl_minutes: int = Field(gt=0)
    issuer: str
    audience: str


class RateLimit(BaseModel):
    requests_per_minute: int = Field(gt=0)
    burst: int = Field(gt=0)
    verify_per_minute: int = Field(gt=0)


class SecurityConfig(BaseModel):
    jwt: JwtConfig
    roles: list[str]
    rate_limit: RateLimit
    cors_allow_origins: list[str]
    max_body_bytes: int = Field(gt=0)


class Region(BaseModel):
    id: str
    name: str


class Config(BaseModel):
    base: BaseConfig
    serve: ServeConfig
    security: SecurityConfig
    regions: list[Region]

    @property
    def region_ids(self) -> list[str]:
        return [r.id for r in self.regions]

    def region_name(self, region_id: str) -> str | None:
        return next((r.name for r in self.regions if r.id == region_id), None)


class Secrets(BaseSettings):
    """Loaded from environment (or a git-ignored .env for local dev)."""

    model_config = SettingsConfigDict(env_prefix="FTL_", env_file=".env", extra="ignore")

    signing_key: SecretStr | None = None  # base64 32-byte Ed25519 seed
    verify_keys_extra: str = ""  # comma-separated base64 public keys from rotated-out signing keys
    jwt_secret: SecretStr | None = None
    data_root: Path = REPO_ROOT
    config_dir: Path = REPO_ROOT / "configs"
    enable_docs: bool = True


def _read_yaml(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_config(config_dir: Path) -> Config:
    return Config(
        base=BaseConfig.model_validate(_read_yaml(config_dir / "base.yaml")),
        serve=ServeConfig.model_validate(_read_yaml(config_dir / "serve.yaml")),
        security=SecurityConfig.model_validate(_read_yaml(config_dir / "security.yaml")),
        regions=[Region.model_validate(r) for r in _read_yaml(config_dir / "regions.yaml")["regions"]],
    )


@lru_cache(maxsize=1)
def get_secrets() -> Secrets:
    return Secrets()

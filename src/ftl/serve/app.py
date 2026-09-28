"""FastAPI application factory.  `make api` → uvicorn --factory ftl.serve.app:create_app on :8000."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ftl.config import Config, Secrets, get_secrets, load_config
from ftl.serve.api.routes import router
from ftl.serve.audit_chain import AuditChain
from ftl.serve.middleware import BodySizeLimit, RateLimit, SecurityHeaders
from ftl.serve.reports import ReportStore
from ftl.serve.signing import Keyring
from ftl.serve.store import AnalogStore, CardStore


def create_app(secrets: Secrets | None = None, cfg: Config | None = None) -> FastAPI:
    s = secrets or get_secrets()
    cfg = cfg or load_config(s.config_dir)
    keyring = Keyring.from_env_values(s.signing_key.get_secret_value() if s.signing_key else None, s.verify_keys_extra)
    root, paths = s.data_root, cfg.base.paths

    app = FastAPI(
        title="Forecast Trust Layer API",
        version="0.1.0",
        description="Forecast-trust verdicts for NWP forecasts over India (SIH26079). See docs/DESIGN.md §11.",
        docs_url="/docs" if s.enable_docs else None,
        redoc_url="/redoc" if s.enable_docs else None,
        openapi_url="/openapi.json" if s.enable_docs else None,
    )
    app.state.cfg = cfg
    app.state.keyring = keyring
    app.state.jwt_secret = s.jwt_secret.get_secret_value() if s.jwt_secret else None
    app.state.store = CardStore(root / paths.cards, keyring)
    app.state.analogs = AnalogStore(root / paths.analogs)
    app.state.audit = AuditChain(root / paths.audit)
    app.state.feedback_chain = AuditChain(root / paths.feedback)
    app.state.reports = ReportStore(root / paths.reports, cfg.serve.indicative_below)

    # Starlette runs the last-added middleware first: rate limit → size cap → CORS → headers.
    app.add_middleware(SecurityHeaders)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.security.cors_allow_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=False,
    )
    app.add_middleware(BodySizeLimit, max_bytes=cfg.security.max_body_bytes)
    rl = cfg.security.rate_limit
    app.add_middleware(
        RateLimit, per_minute=rl.requests_per_minute, burst=rl.burst, verify_per_minute=rl.verify_per_minute
    )
    app.include_router(router)
    return app

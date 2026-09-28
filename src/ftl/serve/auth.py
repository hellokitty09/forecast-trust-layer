"""JWT auth + RBAC (DESIGN §1A, §14): public / sdma / forecaster / scientist / admin.

Tokens are short-lived and verified for signature, expiry, issuer and audience.
Admin tokens must carry ``"mfa"`` in their ``amr`` claim. There is no login
endpoint yet — the identity provider is an open question (OPEN_QUESTIONS #11);
for local development mint a token with:

    uv run python -m ftl.serve.auth --role forecaster --sub dev-user
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ftl.config import JwtConfig, get_secrets, load_config


class Role(StrEnum):
    public = "public"
    sdma = "sdma"
    forecaster = "forecaster"
    scientist = "scientist"
    admin = "admin"


@dataclass(frozen=True)
class Principal:
    sub: str
    role: Role

    @property
    def is_public(self) -> bool:
        return self.role is Role.public


ANONYMOUS = Principal(sub="anonymous", role=Role.public)

_bearer = HTTPBearer(auto_error=False)


def mint_token(secret: str, cfg: JwtConfig, sub: str, role: Role, mfa: bool = False) -> str:
    now = datetime.now(UTC)
    claims = {
        "sub": sub,
        "role": role.value,
        "iss": cfg.issuer,
        "aud": cfg.audience,
        "iat": now,
        "exp": now + timedelta(minutes=cfg.ttl_minutes),
        "amr": ["pwd", "mfa"] if mfa else ["pwd"],
    }
    return jwt.encode(claims, secret, algorithm=cfg.algorithm)


def decode_token(token: str, secret: str, cfg: JwtConfig) -> Principal:
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[cfg.algorithm],
            audience=cfg.audience,
            issuer=cfg.issuer,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token") from e
    try:
        role = Role(str(claims.get("role")))
    except ValueError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unknown role") from e
    if role is Role.admin and "mfa" not in (claims.get("amr") or []):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "admin requires MFA")
    return Principal(sub=str(claims["sub"]), role=role)


def current_principal(
    request: Request, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> Principal:
    if creds is None:
        return ANONYMOUS
    secret = request.app.state.jwt_secret
    if secret is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "authentication not configured")
    return decode_token(creds.credentials, secret, request.app.state.cfg.security.jwt)


def require(*roles: Role):  # type: ignore[no-untyped-def]
    allowed = set(roles) | {Role.admin}

    def dep(p: Annotated[Principal, Depends(current_principal)]) -> Principal:
        if p.is_public:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "authentication required", {"WWW-Authenticate": "Bearer"})
        if p.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        return p

    return dep


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Mint a development JWT.")
    ap.add_argument("--role", type=Role, choices=list(Role), required=True)
    ap.add_argument("--sub", required=True)
    ap.add_argument("--mfa", action="store_true", help="required for admin")
    args = ap.parse_args(argv)
    s = get_secrets()
    if s.jwt_secret is None:
        raise SystemExit("FTL_JWT_SECRET not set")
    cfg = load_config(s.config_dir)
    print(mint_token(s.jwt_secret.get_secret_value(), cfg.security.jwt, args.sub, args.role, args.mfa))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

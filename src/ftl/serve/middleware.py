"""Web hardening (DESIGN §14): security headers, body-size cap, per-client rate limit."""

from __future__ import annotations

import threading
import time
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

Call = Callable[[Request], Awaitable[Response]]

API_CSP = "default-src 'none'; frame-ancestors 'none'"
# Swagger UI / ReDoc load their assets from jsDelivr.
DOCS_CSP = (
    "default-src 'none'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; img-src 'self' data: https://fastapi.tiangolo.com; "
    "connect-src 'self'; worker-src blob:; frame-ancestors 'none'"
)
DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Call) -> Response:
        resp = await call_next(request)
        h = resp.headers
        h["Content-Security-Policy"] = DOCS_CSP if request.url.path.startswith(DOCS_PATHS) else API_CSP
        h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        h["X-Content-Type-Options"] = "nosniff"
        h["Referrer-Policy"] = "no-referrer"
        h["X-Frame-Options"] = "DENY"
        h["Cross-Origin-Resource-Policy"] = "same-site"
        if "authorization" in request.headers:
            h["Cache-Control"] = "no-store"
        return resp


class BodySizeLimit(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next: Call) -> Response:
        if request.method in ("POST", "PUT", "PATCH"):
            declared = request.headers.get("content-length")
            if declared is None or not declared.isdigit():
                return JSONResponse({"detail": "Content-Length required"}, status_code=411)
            if int(declared) > self.max_bytes:
                return JSONResponse({"detail": "request body too large"}, status_code=413)
        return await call_next(request)


class TokenBucket:
    def __init__(self, per_minute: int, burst: int) -> None:
        self.rate = per_minute / 60.0
        self.capacity = float(burst)
        self._state: dict[str, tuple[float, float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            tokens, last = self._state.get(key, (self.capacity, now))
            tokens = min(self.capacity, tokens + (now - last) * self.rate)
            if tokens < 1:
                self._state[key] = (tokens, now)
                return False
            self._state[key] = (tokens - 1, now)
            return True


class RateLimit(BaseHTTPMiddleware):
    """In-process limiter, per client IP. Behind a proxy, enforce limits at the gateway too."""

    def __init__(self, app: ASGIApp, per_minute: int, burst: int, verify_per_minute: int) -> None:
        super().__init__(app)
        self.general = TokenBucket(per_minute, burst)
        self.verify = TokenBucket(verify_per_minute, max(1, verify_per_minute // 6))

    async def dispatch(self, request: Request, call_next: Call) -> Response:
        client = request.client.host if request.client else "unknown"
        bucket = self.verify if request.url.path.endswith("/verify") else self.general
        if not bucket.allow(client):
            return JSONResponse({"detail": "rate limit exceeded"}, status_code=429, headers={"Retry-After": "10"})
        return await call_next(request)

# ftl.serve — API, signing, CAP, auth

Implements **DESIGN.md §11** (API, TrustCard, CAP 1.2) and the serving half of **§14** (security).

```
make dev-env                  # .env with a fresh local Ed25519 signing key + JWT secret
make api                      # http://127.0.0.1:8000  (OpenAPI docs at /docs)
make token ROLE=forecaster    # dev JWT for the UI's "Sign in" box (sdma | forecaster | scientist | admin)
make export-offline           # static fallback bundle of the latest public map
uv run python -m ftl.serve.issue proposals.jsonl   # sign + chain cards produced by the models
```

## Inputs → outputs
| In | Out |
|---|---|
| Unsigned card proposals (JSONL) from the model pipeline (M2–M4) | `data/cards/cards.jsonl` — signed, hash-chained, append-only |
| `data/analogs/analogs.jsonl` (model D, M4) | `/v1/cases/{card_id}` |
| `reports/` from `make eval` (bias, skill, scorecard) | `/v1/bias`, `/v1/scorecard` |
| Forecaster feedback | `data/feedback/feedback.jsonl` + audit entry, status `pending_review` |

The store is empty until the pipeline issues cards, so every region shows `UNAVAILABLE` for now. That's intended.

## Modules
| File | Role |
|---|---|
| `schemas.py` | Pydantic TrustCard (unknown fields rejected, probabilities 0–1, quantiles monotone, UTC init) |
| `failsafe.py` | Applied before signing: confidence is always derived from `bust_prob` with the configured bands; beyond the skill horizon → `NO_SKILL`; missing probability or bad anatomy → `UNAVAILABLE`; unprecedented → LOW |
| `issue.py` | The only path to a servable card: validate all → finalize → chain → sign → append (file-locked). Sets `issued_at` and `supersedes` itself (Live Bust Watch); rejects duplicate `card_id`s |
| `signing.py` | Ed25519 over canonical JSON (sorted keys) without `signature`. Format `ed25519:<key_id>:<b64>` |
| `store.py` | Loads the chain, re-verifying schema, signature and links. A break rejects every later card (a deleted line could otherwise bring back an older, more confident card) and `/v1/health` reports `degraded` |
| `audit_chain.py` | Generic hash-chained JSONL log |
| `mapview.py` | GeoJSON map shared by `/v1/map` and the offline exporter |
| `reports.py` | Validates and serves `reports/` (bias, skill horizon, scorecard); the server computes the `indicative` flag itself |
| `export_offline.py` | Writes `ui/public/offline/map-latest.json` (public tier + chain head hash) |
| `cap.py` | CAP 1.2 with `forecastConfidence`, `bustProbability`, `trustHorizonDay`, `reason`, plus the card's hash and signature |
| `auth.py` | Short-lived JWT, RBAC public/sdma/forecaster/admin, MFA claim required for admin |
| `middleware.py` | CSP/HSTS/nosniff headers, body-size cap, per-IP rate limit (stricter on `/verify`) |

## Access
| Endpoint | Role |
|---|---|
| `GET /v1/health`, `GET /v1/keys`, `GET /v1/chain`, `POST /v1/verify` | public |
| `GET /v1/map` | public (probabilities rounded **up** to `public_round_step`) or full with a token |
| `GET /v1/trust`, `/v1/trust/history`, `/v1/alerts`, `/v1/cap/{id}.xml` | sdma, forecaster (see OPEN_QUESTIONS #14) |
| `GET /v1/bias` | scientist, forecaster |
| `GET /v1/scorecard` | scientist |
| `GET /v1/cases/{id}`, `POST /v1/feedback` | forecaster |

Admin can do everything but needs `"mfa"` in the token's `amr` claim.

## Key rotation
Generate a new seed and put it in `FTL_SIGNING_KEY`. Append the old **public** key (from `GET /v1/keys`) to
`FTL_VERIFY_KEYS_EXTRA` so previously issued cards still verify.

## Not done yet
- Enveloped XML-Signature on CAP (OPEN_QUESTIONS #12)
- Identity provider / login (OPEN_QUESTIONS #11). Tokens are minted with a CLI for now.
- Model loading with manifest SHA-256 checks (rule 5) belongs in `ftl.models` once models exist.
- The rate limiter is per process and in memory. Enforce limits at the gateway as well in deployment.

.PHONY: setup dev-env api token export-offline data-mvp data-imd eval test lint audit ui ui-test ui-build

setup:         ## install Python + UI deps
	uv sync --all-extras
	cd ui && npm install

data-mvp:      ## M0 data: IFS HRES rain (WeatherBench 2, India crop, JJAS first) + IMD rain
	uv run --extra pipeline python -m ftl.data.wb2_hres
	$(MAKE) data-imd

data-imd:      ## IMD 0.25° rain 1986-2022 (SEEPS climatology + evaluation years)
	uv run --extra pipeline python -m ftl.data.imd_rain --years 1986-2022

eval:          ## M0 validation pack: bias + skill horizon → reports/ (+ PPT figures in reports/m0/figures)
	uv run --extra pipeline python -m ftl.eval.m0

dev-env:       ## write .env with fresh local signing key + JWT secret
	uv run python scripts/dev_env.py

api:           ## FastAPI on :8000 (docs at /docs)
	uv run uvicorn --factory ftl.serve.app:create_app --host 127.0.0.1 --port 8000 --reload

export-offline: ## static fallback: latest cycle's public map → ui/public/offline/map-latest.json
	uv run python -m ftl.serve.export_offline

token:         ## mint a dev JWT: make token ROLE=forecaster (sdma | forecaster | scientist | admin)
	@uv run python -m ftl.serve.auth --role $(or $(ROLE),forecaster) --sub dev-$(USER) $(if $(filter admin,$(ROLE)),--mfa,)

test:
	uv run pytest
	cd ui && npm test

lint:
	uv run ruff check src tests
	uv run ruff format --check src tests
	uv run mypy

audit:
	uv run pip-audit
	uv run bandit -q -r src
	cd ui && npm audit --omit=dev
	@command -v gitleaks >/dev/null && gitleaks dir . --no-banner || echo "gitleaks not installed (brew install gitleaks) — CI runs it"

ui:            ## dashboard on :5173
	cd ui && npm run dev

ui-test:
	cd ui && npm test && npm run typecheck

ui-build:
	cd ui && npm run build

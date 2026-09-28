"""Write the static offline fallback: the latest cycle's public map for every variable × lead (DESIGN §12, §14 DoS).

    uv run python -m ftl.serve.export_offline            # → ui/public/offline/map-latest.json

Public tier only (rounded, no internals). Each feature keeps its card_id and the bundle records the chain
head hash, so anything shown offline can later be checked against the Forecast Black Box.
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from ftl.config import REPO_ROOT, get_secrets, load_config
from ftl.serve.mapview import build_map
from ftl.serve.schemas import Variable
from ftl.serve.signing import Keyring
from ftl.serve.store import CardStore


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=REPO_ROOT / "ui/public/offline/map-latest.json")
    args = ap.parse_args(argv)
    s = get_secrets()
    cfg = load_config(s.config_dir)
    keyring = Keyring.from_env_values(s.signing_key.get_secret_value() if s.signing_key else None, s.verify_keys_extra)
    store = CardStore(s.data_root / cfg.base.paths.cards, keyring)
    latest = store.latest()
    if latest is None:
        print("no valid cards in the chain — nothing to export")
        return 1
    init = latest.card.init_time
    maps = {
        f"{v}:{lead}": build_map(cfg, store, init, lead, Variable(v), public=True)
        for v in cfg.base.variables
        for lead in range(cfg.base.lead_days.min, cfg.base.lead_days.max + 1)
    }
    bundle = {
        "init_time": init.isoformat().replace("+00:00", "Z"),
        "exported_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "chain_head": store.snapshot().head,
        "maps": maps,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(bundle, ensure_ascii=False))
    print(f"wrote {args.out} (init {bundle['init_time']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

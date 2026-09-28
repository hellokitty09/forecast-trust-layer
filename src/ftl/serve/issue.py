"""Issue Trust Cards: fail-safe finalize → chain → sign → append.

The model pipeline (M2–M4) writes *unsigned* card proposals as JSONL; this is
the only code path that turns them into servable, signed cards:

    uv run python -m ftl.serve.issue proposals.jsonl
"""

from __future__ import annotations

import argparse
import fcntl
import json
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from ftl.config import Config, get_secrets, load_config
from ftl.serve.audit_chain import AuditChain
from ftl.serve.failsafe import finalize
from ftl.serve.schemas import TrustCard
from ftl.serve.signing import GENESIS_HASH, Keyring, card_hash
from ftl.serve.store import load_snapshot


class IssueError(ValueError):
    pass


def _tail_hash(path: Path) -> str:
    if not path.exists():
        return GENESIS_HASH
    last = None
    with path.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                last = line
    return GENESIS_HASH if last is None else card_hash(json.loads(last))


class Issuer:
    def __init__(self, cfg: Config, keyring: Keyring, cards_path: Path, audit: AuditChain) -> None:
        if keyring.signer is None:
            raise IssueError("cannot issue cards: FTL_SIGNING_KEY not set")
        self.cfg, self.keyring, self.cards_path, self.audit = cfg, keyring, cards_path, audit
        self.cards_path.parent.mkdir(parents=True, exist_ok=True)

    def issue_many(self, proposals: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Validate all proposals first; append nothing if any is invalid."""
        region_ids = set(self.cfg.region_ids)
        cards: list[TrustCard] = []
        for i, p in enumerate(proposals, start=1):
            # Chain bookkeeping is owned by the issuer, never by the proposal.
            p = {k: v for k, v in p.items() if k not in ("signature", "prev_hash", "issued_at", "supersedes")}
            p.setdefault("card_id", str(uuid.uuid4()))
            p["schema_version"] = self.cfg.serve.schema_version
            try:
                card = TrustCard.model_validate(p)
            except ValidationError as e:
                raise IssueError(f"proposal {i}: {e.error_count()} validation error(s): {e.errors()[0]['msg']}") from e
            if card.region_id not in region_ids:
                raise IssueError(f"proposal {i}: unknown region_id {card.region_id!r}")
            cards.append(finalize(card, self.cfg.serve.confidence, self.cfg.serve.anatomy_sum_tolerance))

        issued: list[dict[str, Any]] = []
        with self.cards_path.open("a+", encoding="utf-8") as f:
            fcntl.flock(f, fcntl.LOCK_EX)  # one writer at a time across processes
            try:
                prev = _tail_hash(self.cards_path)
                snap = load_snapshot(self.cards_path, self.keyring)
                clash = [c.card_id for c in cards if c.card_id in snap.by_id]
                if clash or len({c.card_id for c in cards}) != len(cards):
                    raise IssueError(f"card_id must be unique across the chain: {clash[:3] or 'duplicate in batch'}")
                current = {k: sc.card.card_id for k, sc in snap.by_key.items()}
                issued_at = datetime.now(UTC)
                for card in cards:
                    key = (card.init_time, card.lead_day, card.region_id, card.variable)
                    raw = card.model_copy(
                        update={
                            "issued_at": issued_at,
                            "supersedes": current.get(key),
                            "prev_hash": prev,
                            "signature": None,
                        }
                    ).model_dump(mode="json")
                    current[key] = card.card_id
                    raw["signature"] = self.keyring.sign(raw)
                    f.write(json.dumps(raw, ensure_ascii=False) + "\n")
                    prev = card_hash(raw)
                    issued.append(raw)
                f.flush()
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
        for raw in issued:
            self.audit.append("card_issued", {"card_id": raw["card_id"], "card_hash": card_hash(raw)})
        return issued


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Sign and append Trust Card proposals to the card chain.")
    ap.add_argument("proposals", type=Path, help="JSONL of unsigned card proposals")
    args = ap.parse_args(argv)
    s = get_secrets()
    cfg = load_config(s.config_dir)
    keyring = Keyring.from_env_values(s.signing_key.get_secret_value() if s.signing_key else None, s.verify_keys_extra)
    with args.proposals.open(encoding="utf-8") as f:
        proposals = [json.loads(line) for line in f if line.strip()]
    issuer = Issuer(cfg, keyring, s.data_root / cfg.base.paths.cards, AuditChain(s.data_root / cfg.base.paths.audit))
    try:
        issued = issuer.issue_many(proposals)
    except IssueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(f"issued {len(issued)} card(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

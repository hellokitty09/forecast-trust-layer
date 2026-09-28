import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ftl.config import Config, Secrets
from ftl.serve.audit_chain import AuditChain
from ftl.serve.signing import Keyring
from ftl.serve.store import load_snapshot

from .conftest import proposal


def test_audit_chain_detects_edit(tmp_path: Path) -> None:
    chain = AuditChain(tmp_path / "a.jsonl")
    for i in range(3):
        chain.append("x", {"i": i})
    assert chain.verify()[0]
    lines = (tmp_path / "a.jsonl").read_text().splitlines()
    e = json.loads(lines[1])
    e["payload"]["i"] = 99
    lines[1] = json.dumps(e)
    (tmp_path / "a.jsonl").write_text("\n".join(lines) + "\n")
    assert not AuditChain(tmp_path / "a.jsonl").verify()[0]


def test_store_rejects_everything_after_deleted_card(
    issue: Callable[..., list[dict[str, Any]]], secrets: Secrets, cfg: Config, keyring: Keyring
) -> None:
    issue(*[proposal(region_id=r) for r in ("IMD_SUB_ODISHA", "IMD_SUB_BIHAR", "IMD_SUB_GUJARAT")])
    path = secrets.data_root / cfg.base.paths.cards
    assert load_snapshot(path, keyring).chain_intact
    lines = path.read_text().splitlines()
    path.write_text(lines[0] + "\n" + lines[2] + "\n")  # delete the middle card
    snap = load_snapshot(path, keyring)
    assert not snap.chain_intact
    assert snap.rejected == 1 and len(snap.by_id) == 1


def test_store_rejects_tampered_card(
    issue: Callable[..., list[dict[str, Any]]], secrets: Secrets, cfg: Config, keyring: Keyring
) -> None:
    issue(proposal())
    path = secrets.data_root / cfg.base.paths.cards
    card = json.loads(path.read_text())
    card["bust_prob"] = 0.05
    path.write_text(json.dumps(card) + "\n")
    snap = load_snapshot(path, keyring)
    assert len(snap.by_id) == 0 and snap.rejected == 1


def test_later_card_supersedes(
    issue: Callable[..., list[dict[str, Any]]], secrets: Secrets, cfg: Config, keyring: Keyring
) -> None:
    issue(proposal())
    issue(proposal(bust_prob=0.1, bust_prob_interval=[0.05, 0.2]))  # live cycle re-score
    snap = load_snapshot(secrets.data_root / cfg.base.paths.cards, keyring)
    (only,) = snap.by_key.values()
    assert only.card.bust_prob == 0.1

"""Signed Trust Card store backed by an append-only, hash-chained JSONL file.

Every card is checked on load: schema, Ed25519 signature, and its link to the
previous card. A card that fails any check is never served. If the chain is
broken, every card after the break is rejected too (a deleted line could
otherwise resurrect an older, more confident card) and /v1/health reports it.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from ftl.serve.schemas import Analog, TrustCard, Variable
from ftl.serve.signing import GENESIS_HASH, Keyring, card_hash

CardKey = tuple[datetime, int, str, Variable]


@dataclass(frozen=True)
class StoredCard:
    raw: dict[str, Any]  # exactly as signed — returned byte-for-byte equivalent
    card: TrustCard
    hash: str


@dataclass
class Snapshot:
    by_key: dict[CardKey, StoredCard] = field(default_factory=dict)
    history: dict[CardKey, list[StoredCard]] = field(default_factory=dict)  # every valid version, chain order
    by_id: dict[str, StoredCard] = field(default_factory=dict)
    by_hash: dict[str, int] = field(default_factory=dict)  # card hash → position in chain
    hashes: list[str] = field(default_factory=list)
    rejected: int = 0
    chain_intact: bool = True
    chain_detail: str = "empty"
    head: str = GENESIS_HASH


def _key(c: TrustCard) -> CardKey:
    return (c.init_time, c.lead_day, c.region_id, c.variable)


def load_snapshot(path: Path, keyring: Keyring) -> Snapshot:
    snap = Snapshot()
    if not path.exists():
        return snap
    prev = GENESIS_HASH
    with path.open(encoding="utf-8") as f:
        lines = [ln for ln in f if ln.strip()]
    for i, line in enumerate(lines, start=1):
        if not snap.chain_intact:
            snap.rejected += 1
            continue
        try:
            raw = json.loads(line)
        except json.JSONDecodeError:
            snap.chain_intact, snap.chain_detail = False, f"line {i}: not JSON"
            snap.rejected += 1
            continue
        if not isinstance(raw, dict) or raw.get("prev_hash") != prev:
            snap.chain_intact, snap.chain_detail = False, f"line {i}: prev_hash does not match previous card"
            snap.rejected += 1
            continue
        h = card_hash(raw)
        prev = h
        snap.hashes.append(h)
        snap.by_hash[h] = len(snap.hashes) - 1
        ok, _ = keyring.verify(raw)
        if not ok:
            snap.rejected += 1
            continue
        try:
            card = TrustCard.model_validate(raw)
        except ValidationError:
            snap.rejected += 1
            continue
        sc = StoredCard(raw=raw, card=card, hash=h)
        snap.by_key[_key(card)] = sc  # later cards (live cycle re-scores) supersede earlier ones
        snap.history.setdefault(_key(card), []).append(sc)
        snap.by_id[card.card_id] = sc
    snap.head = prev
    if snap.chain_intact:
        snap.chain_detail = f"{len(snap.hashes)} cards chained"
    return snap


class CardStore:
    def __init__(self, path: Path, keyring: Keyring) -> None:
        self.path = path
        self.keyring = keyring
        self._lock = threading.Lock()
        self._stamp: tuple[int, int] | None = None
        self._snap = Snapshot()

    def _file_stamp(self) -> tuple[int, int] | None:
        try:
            st = self.path.stat()
        except FileNotFoundError:
            return None
        return (st.st_mtime_ns, st.st_size)

    def snapshot(self) -> Snapshot:
        """Reload when the file changes (live cycle updates append new cards)."""
        with self._lock:
            stamp = self._file_stamp()
            if stamp != self._stamp:
                self._snap = load_snapshot(self.path, self.keyring)
                self._stamp = stamp
            return self._snap

    def get(self, init: datetime, lead: int, region: str, variable: Variable) -> StoredCard | None:
        return self.snapshot().by_key.get((init, lead, region, variable))

    def history(self, init: datetime, lead: int, region: str, variable: Variable) -> list[StoredCard]:
        return list(self.snapshot().history.get((init, lead, region, variable), []))

    def by_id(self, card_id: str) -> StoredCard | None:
        return self.snapshot().by_id.get(card_id)

    def cards_for_init(self, init: datetime) -> list[StoredCard]:
        return [sc for k, sc in self.snapshot().by_key.items() if k[0] == init]

    def latest(self) -> StoredCard | None:
        cards = self.snapshot().by_key.values()
        return max(cards, key=lambda sc: sc.card.init_time, default=None)


class AnalogStore:
    """Analog cases (DESIGN §8 model D), keyed by analog_id. Written by the M4 pipeline."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def get_many(self, ids: list[str]) -> list[Analog]:
        if not ids or not self.path.exists():
            return []
        wanted, found = set(ids), {}
        with self.path.open(encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    a = Analog.model_validate_json(line)
                except ValidationError:
                    continue
                if a.analog_id in wanted:
                    found[a.analog_id] = a
        return [found[i] for i in ids if i in found]

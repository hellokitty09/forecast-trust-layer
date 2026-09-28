"""Hash-chained, append-only JSONL log (DESIGN §14: outputs, overrides, feedback).

Each line: {"seq", "ts", "kind", "payload", "prev_hash", "hash"} where
hash = sha256(canonical(entry without "hash")). Editing or deleting any line
breaks every hash after it, which `verify()` detects.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ftl.serve.signing import GENESIS_HASH, canonical_bytes, sha256_hex


class ChainError(RuntimeError):
    pass


class AuditChain:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._seq, self._head = self._scan_tail()

    def _scan_tail(self) -> tuple[int, str]:
        seq, head = 0, GENESIS_HASH
        if self.path.exists():
            for entry in self._iter():
                seq, head = entry["seq"], entry["hash"]
        return seq, head

    def _iter(self) -> list[dict[str, Any]]:
        with self.path.open(encoding="utf-8") as f:
            return [json.loads(line) for line in f if line.strip()]

    def append(self, kind: str, payload: dict[str, Any]) -> str:
        with self._lock:
            entry: dict[str, Any] = {
                "seq": self._seq + 1,
                "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                "kind": kind,
                "payload": payload,
                "prev_hash": self._head,
            }
            entry["hash"] = sha256_hex(canonical_bytes(entry))
            with self.path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
                f.flush()
                os.fsync(f.fileno())
            self._seq, self._head = entry["seq"], entry["hash"]
            return str(entry["hash"])

    def verify(self) -> tuple[bool, str]:
        if not self.path.exists():
            return True, "empty chain"
        prev, seq = GENESIS_HASH, 0
        for entry in self._iter():
            body = {k: v for k, v in entry.items() if k != "hash"}
            if entry.get("prev_hash") != prev or entry.get("seq") != seq + 1:
                return False, f"chain broken at seq {seq + 1}"
            if sha256_hex(canonical_bytes(body)) != entry.get("hash"):
                return False, f"entry {entry.get('seq')} was modified"
            prev, seq = entry["hash"], entry["seq"]
        return True, f"{seq} entries intact"

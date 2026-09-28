"""Ed25519 Trust Card signing (DESIGN §14).

Signed bytes = canonical JSON of the card with the ``signature`` field removed.
Signature format: ``ed25519:<key_id>:<base64 signature>``.
Keys come from the environment only; rotation = move the old public key into
FTL_VERIFY_KEYS_EXTRA and set a new FTL_SIGNING_KEY.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
from dataclasses import dataclass
from typing import Any

from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey

GENESIS_HASH = "0" * 64
SIG_PREFIX = "ed25519"


def canonical_bytes(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def card_hash(card: dict[str, Any]) -> str:
    """Hash of the full signed card — what the next card's prev_hash points to."""
    return sha256_hex(canonical_bytes(card))


def signed_payload(card: dict[str, Any]) -> bytes:
    return canonical_bytes({k: v for k, v in card.items() if k != "signature"})


def key_id(vk: VerifyKey) -> str:
    return sha256_hex(bytes(vk))[:16]


@dataclass(frozen=True)
class Keyring:
    signer: SigningKey | None
    verifiers: dict[str, VerifyKey]  # key_id → key; includes the current key

    @property
    def current_key_id(self) -> str | None:
        return key_id(self.signer.verify_key) if self.signer else None

    @classmethod
    def from_env_values(cls, signing_key_b64: str | None, extra_verify_b64: str) -> Keyring:
        signer = None
        verifiers: dict[str, VerifyKey] = {}
        if signing_key_b64:
            seed = _b64(signing_key_b64, "FTL_SIGNING_KEY")
            if len(seed) != 32:
                raise ValueError("FTL_SIGNING_KEY must be a base64-encoded 32-byte Ed25519 seed")
            signer = SigningKey(seed)
            verifiers[key_id(signer.verify_key)] = signer.verify_key
        for item in filter(None, (s.strip() for s in extra_verify_b64.split(","))):
            vk = VerifyKey(_b64(item, "FTL_VERIFY_KEYS_EXTRA"))
            verifiers[key_id(vk)] = vk
        return cls(signer=signer, verifiers=verifiers)

    def sign(self, card: dict[str, Any]) -> str:
        if self.signer is None:
            raise RuntimeError("signing disabled: FTL_SIGNING_KEY not set")
        sig = self.signer.sign(signed_payload(card)).signature
        return f"{SIG_PREFIX}:{self.current_key_id}:{base64.b64encode(sig).decode()}"

    def verify(self, card: dict[str, Any]) -> tuple[bool, str]:
        sig = card.get("signature")
        if not isinstance(sig, str):
            return False, "card has no signature"
        parts = sig.split(":")
        if len(parts) != 3 or parts[0] != SIG_PREFIX:
            return False, "malformed signature"
        vk = self.verifiers.get(parts[1])
        if vk is None:
            return False, f"unknown signing key {parts[1]!r}"
        try:
            vk.verify(signed_payload(card), _b64(parts[2], "signature"))
        except (BadSignatureError, ValueError):
            return False, "signature does not match card contents"
        return True, "signature valid"


def _b64(s: str, what: str) -> bytes:
    try:
        return base64.b64decode(s, validate=True)
    except (binascii.Error, ValueError) as e:
        raise ValueError(f"{what} is not valid base64") from e

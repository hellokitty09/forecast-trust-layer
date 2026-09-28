import base64

from nacl.signing import SigningKey

from ftl.serve.signing import Keyring

CARD = {"card_id": "c1", "bust_prob": 0.4, "reasons": ["a"], "prev_hash": "0" * 64}


def test_roundtrip(keyring: Keyring) -> None:
    card = dict(CARD, signature=keyring.sign(CARD))
    assert keyring.verify(card) == (True, "signature valid")


def test_key_order_does_not_matter(keyring: Keyring) -> None:
    card = dict(CARD, signature=keyring.sign(CARD))
    assert keyring.verify(dict(reversed(list(card.items()))))[0]


def test_tampered_value_fails(keyring: Keyring) -> None:
    card = dict(CARD, signature=keyring.sign(CARD))
    card["bust_prob"] = 0.1
    assert not keyring.verify(card)[0]


def test_missing_and_malformed_signature(keyring: Keyring) -> None:
    assert not keyring.verify(CARD)[0]
    assert not keyring.verify(dict(CARD, signature="ed25519:abc"))[0]


def test_unknown_key_rejected(keyring: Keyring) -> None:
    other = Keyring.from_env_values(base64.b64encode(bytes(SigningKey.generate())).decode(), "")
    card = dict(CARD, signature=other.sign(CARD))
    assert keyring.verify(card) == (False, f"unknown signing key {card['signature'].split(':')[1]!r}")


def test_rotated_key_still_verifies() -> None:
    old = SigningKey.generate()
    old_ring = Keyring.from_env_values(base64.b64encode(bytes(old)).decode(), "")
    card = dict(CARD, signature=old_ring.sign(CARD))
    new_ring = Keyring.from_env_values(
        base64.b64encode(bytes(SigningKey.generate())).decode(), base64.b64encode(bytes(old.verify_key)).decode()
    )
    assert new_ring.verify(card)[0]

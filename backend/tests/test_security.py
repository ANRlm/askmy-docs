import pytest
from utils.security import generate_api_key, hash_api_key


def test_generate_api_key_format():
    key = generate_api_key()
    assert key.startswith("sk-")
    assert len(key) == 51


def test_hash_api_key_deterministic():
    key = "sk-abc123test"
    h = hash_api_key(key)
    assert hash_api_key(key) == h
    assert h != key
    assert len(h) == 64


def test_generate_api_key_uniqueness():
    keys = [generate_api_key() for _ in range(100)]
    assert len(set(keys)) == 100

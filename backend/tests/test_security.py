from utils.security import generate_api_key, hash_api_key, verify_api_key


def test_generate_api_key_format():
    key = generate_api_key()
    assert key.startswith("sk-")
    assert len(key) == 51


def test_hash_and_verify_api_key():
    key = "sk-abc123test"
    h = hash_api_key(key)
    assert h != key
    assert ":" in h  # salt:hash format
    assert verify_api_key(key, h)


def test_verify_api_key_wrong_key():
    key = "sk-abc123test"
    h = hash_api_key(key)
    assert not verify_api_key("sk-wrongkey", h)


def test_generate_api_key_uniqueness():
    keys = [generate_api_key() for _ in range(100)]
    assert len(set(keys)) == 100

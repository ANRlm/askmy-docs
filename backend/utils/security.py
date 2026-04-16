import base64
import hashlib
import hmac
import secrets
import string

import bcrypt
from datetime import datetime, timedelta, timezone
from jose import jwt
from config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_jwt_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_jwt_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def generate_api_key() -> str:
    alphabet = string.ascii_letters + string.digits
    random_part = "".join(secrets.choice(alphabet) for _ in range(48))
    return f"sk-{random_part}"


def hash_api_key(key: str) -> str:
    salt = secrets.token_bytes(32)
    dk = hashlib.pbkdf2_hmac("sha256", key.encode(), salt, 100000)
    return f"{base64.b64encode(salt).decode()}:{base64.b64encode(dk).decode()}"


def verify_api_key(key: str, stored: str) -> bool:
    try:
        salt_b64, hash_b64 = stored.split(":")
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        actual = hashlib.pbkdf2_hmac("sha256", key.encode(), salt, 100000)
        return hmac.compare_digest(expected, actual)
    except (ValueError, Exception):
        return False

"""
Authentication primitives (Section 3 "secure login" gap from the README).

Standard-library only on purpose so the demo needs no new dependencies:
  - PBKDF2-SHA256 password hashing (never store plaintext).
  - HMAC-SHA256 signed, expiring bearer tokens (JWT-shaped, zero deps).

In production this swaps to real OAuth2/OpenID Connect via the same
dependencies (get_current_user) — nothing in the routers needs to change.
"""
import os
import json
import time
import base64
import hmac
import hashlib
import secrets

SECRET_KEY = os.getenv("PRAHARI_SECRET", "prahari-demo-secret-change-me")
TOKEN_TTL_HOURS = 12


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split("$", 1)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
        return hmac.compare_digest(dk.hex(), expected)
    except Exception:
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def create_token(payload: dict, ttl_hours: int = TOKEN_TTL_HOURS) -> str:
    body = dict(payload)
    body["exp"] = int(time.time()) + ttl_hours * 3600
    header = _b64(json.dumps(body, separators=(",", ":")).encode())
    signature = hmac.new(SECRET_KEY.encode(), header.encode(), hashlib.sha256).digest()
    return f"{header}.{_b64(signature)}"


def decode_token(token: str) -> dict | None:
    try:
        header, signature = token.split(".", 1)
        expected = hmac.new(SECRET_KEY.encode(), header.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_unb64(signature), expected):
            return None
        body = json.loads(_unb64(header))
        if body.get("exp", 0) < time.time():
            return None
        return body
    except Exception:
        return None

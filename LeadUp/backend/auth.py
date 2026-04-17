from __future__ import annotations
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .config import get_settings

bearer = HTTPBearer()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: str, email: str, role: str) -> str:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(hours=s.jwt_expiry_hours)
    return jwt.encode(
        {"id": user_id, "email": email, "role": role, "exp": exp},
        s.jwt_secret,
        algorithm=s.jwt_algorithm,
    )


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    s = get_settings()
    try:
        return jwt.decode(credentials.credentials, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


def require_admin(user: dict = Depends(verify_token)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Se requiere rol admin")
    return user

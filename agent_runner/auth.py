from __future__ import annotations
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from .config import get_settings

bearer = HTTPBearer()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    s = get_settings()
    try:
        payload = jwt.decode(credentials.credentials, s.jwt_secret, algorithms=[s.jwt_algorithm])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


def require_admin(user: dict = Depends(verify_token)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Se requiere rol admin")
    return user

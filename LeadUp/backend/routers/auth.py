from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from ..database import db_conn
from ..auth import verify_password, hash_password, create_token, verify_token

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "commercial"


@router.post("/login")
async def login(body: LoginRequest):
    async with db_conn() as conn:
        user = await conn.fetchrow(
            "SELECT id, name, email, password_hash, role FROM lu_users WHERE email=$1 AND active=TRUE",
            body.email.lower().strip(),
        )
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")

    async with db_conn() as conn:
        await conn.execute("UPDATE lu_users SET last_login=NOW() WHERE id=$1", user["id"])

    token = create_token(str(user["id"]), user["email"], user["role"])
    return {"token": token, "name": user["name"], "role": user["role"]}


@router.post("/register")
async def register(body: RegisterRequest, user: dict = Depends(verify_token)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo admins pueden crear usuarios")
    async with db_conn() as conn:
        try:
            row = await conn.fetchrow(
                "INSERT INTO lu_users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id",
                body.name,
                body.email.lower().strip(),
                hash_password(body.password),
                body.role,
            )
        except Exception:
            raise HTTPException(status_code=409, detail="Email ya registrado")
    return {"id": str(row["id"]), "email": body.email}


@router.get("/me")
async def me(user: dict = Depends(verify_token)):
    uid = user.get("id")
    async with db_conn() as conn:
        row = await conn.fetchrow(
            "SELECT id, name, email, role, lead_search_enabled FROM lu_users WHERE id=$1",
            uid
        )
    if not row:
        return user  # fallback al token si no existe
    return dict(row)

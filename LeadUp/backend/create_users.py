#!/usr/bin/env python3
"""Crea usuarios por defecto para LeadUp."""
import asyncio
import asyncpg
import bcrypt
import os

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "leadup")
DB_USER = os.getenv("DB_USER", "fai_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "fai_db_2024_secure")

USERS = [
    {"name": "Toni", "email": "toni@cliender.com", "password": "Master123", "role": "admin"},
    {"name": "Dan", "email": "dan@cliender.com", "password": "Master123", "role": "admin"},
    {"name": "Nicolas", "email": "nicolas@cliender.com", "password": "Master123", "role": "admin"},
    {"name": "Rubén", "email": "ruben@cliender.com", "password": "Cliender123", "role": "commercial"},
    {"name": "Ethan", "email": "ethan@cliender.com", "password": "Cliender123", "role": "commercial"},
]

async def create_users():
    try:
        conn = await asyncpg.connect(
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASSWORD, timeout=5
        )

        for user in USERS:
            pwd_hash = bcrypt.hashpw(user["password"].encode(), bcrypt.gensalt()).decode()
            try:
                await conn.execute(
                    "INSERT INTO lu_users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)",
                    user["name"], user["email"], pwd_hash, user["role"]
                )
                print(f"✅ {user['name']}: {user['email']} / {user['password']}")
            except Exception as e:
                if "unique constraint" in str(e):
                    print(f"⚠️  {user['name']} ({user['email']}) ya existe")
                else:
                    raise

        await conn.close()
        print("\n✅ Usuarios creados")

    except Exception as e:
        print(f"❌ Error: {e}")
        exit(1)

if __name__ == "__main__":
    asyncio.run(create_users())

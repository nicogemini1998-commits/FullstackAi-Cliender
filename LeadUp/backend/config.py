from __future__ import annotations
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # DB propia de LeadUp (misma instancia PostgreSQL, distinta DB)
    db_host: str = "127.0.0.1"
    db_port: int = 5432
    db_name: str = "leadup"
    db_user: str = "fai_user"
    db_password: str = "fai_db_2024_secure"

    # JWT
    jwt_secret: str = "leadup_secret_jwt_2024"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 8

    # FullStackAI agent runner
    fullstackai_url: str = "http://localhost:8001"
    fullstackai_token: str = ""   # service token fijo para llamadas internas

    # Scheduler
    enrichment_cron_hour: int = 8
    enrichment_sector: str = "restaurantes"
    enrichment_city: str = "Madrid"
    enrichment_qty: int = 10

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()

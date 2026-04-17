from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # PostgreSQL — misma DB que Node.js
    db_host: str = "127.0.0.1"
    db_port: int = 5432
    db_name: str = "fullstackai"
    db_user: str = "fai_user"
    db_password: str = "fai_db_2024_secure"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT — mismo secret que server.js
    jwt_secret: str = "fullstackai_secret_key"
    jwt_algorithm: str = "HS256"

    # Anthropic
    anthropic_api_key: str = ""

    # Apollo
    apollo_api_key: str = ""

    # Apify
    apify_api_key: str = ""

    # Rate limiting
    max_executions_per_minute: int = 10

    class Config:
        env_file = "../.env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()

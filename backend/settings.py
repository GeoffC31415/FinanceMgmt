from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FINANCES_", extra="ignore")

    sqlite_path: str = "finances.db"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://wsl.localhost:5173",
    ]


def get_settings() -> Settings:
    return Settings()


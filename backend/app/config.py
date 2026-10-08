from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # CoinGecko access. A free Demo key is effectively required (keyless is throttled hard).
    coingecko_api_key: str | None = None
    coingecko_base_url: str = "https://api.coingecko.com/api/v3"

    # Market data is re-fetched every CACHE_TTL_SECONDS. Per-coin details (preview_listing,
    # TVL) change slowly, so they are persisted in SQLite and re-checked after DETAILS_TTL_SECONDS.
    cache_ttl_seconds: int = 300
    details_ttl_seconds: int = 6 * 3600
    db_path: Path = BACKEND_DIR / "data" / "coins.db"

    # Request budget / politeness.
    max_pages: int = 12
    concurrency: int = 5
    min_request_interval: float = 0.67  # ~1.5 req/s, below the Demo plan's ~100 calls/min
    max_retries: int = 4
    request_timeout: float = 15.0

    # Filter thresholds (USD).
    fdv_max: float = 100_000_000
    volume_min: float = 50_000
    tvl_min: float = 50_000
    supply_rel_tol: float = 1e-6

    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # CoinGecko access. A free Demo key is effectively required (keyless is throttled hard).
    coingecko_api_key: str | None = None
    coingecko_base_url: str = "https://api.coingecko.com/api/v3"

    # Caching (seconds). Details change slowly, so they live longer than the final result.
    cache_ttl_seconds: int = 300
    detail_cache_ttl_seconds: int = 3600

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

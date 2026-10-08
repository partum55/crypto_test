from datetime import datetime

from pydantic import BaseModel


class Project(BaseModel):
    id: str
    symbol: str
    name: str
    image: str | None
    coingecko_url: str
    current_price: float | None
    market_cap: float
    fully_diluted_valuation: float
    total_volume: float
    total_supply: float
    max_supply: float
    total_value_locked: float
    preview_listing: bool


class Meta(BaseModel):
    scanned: int  # unique coins read from /coins/markets
    pages_fetched: int
    after_prefilter: int  # passed mcap / FDV / volume / supply
    after_details: int  # also passed preview_listing / TVL
    detail_errors: int  # coins whose /coins/{id} call failed (skipped)
    fetched_at: datetime
    age_seconds: float
    stale: bool  # older than CACHE_TTL_SECONDS
    refreshing: bool  # a background refresh is running
    last_error: str | None  # last failed refresh, if any


class ProjectsResponse(BaseModel):
    count: int
    items: list[Project]
    meta: Meta

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


class FunnelStep(BaseModel):
    key: str
    label: str
    passed: int  # coins remaining after this step (cumulative)


class Meta(BaseModel):
    scanned: int  # unique coins read from /coins/markets
    pages_fetched: int
    after_prefilter: int  # passed mcap / FDV / volume / supply
    preview_listed: int  # candidates with preview_listing == true
    tvl_above_min: int  # candidates with TVL > TVL_MIN
    after_details: int  # passed all six criteria (independent of require_preview)
    details_fetched: int  # /coins/{id} calls this refresh (rest came from SQLite)
    detail_errors: int  # coins whose /coins/{id} call failed (skipped)
    fetched_at: datetime
    age_seconds: float
    stale: bool  # older than CACHE_TTL_SECONDS
    refreshing: bool  # a background refresh is running
    last_error: str | None  # last failed refresh, if any
    require_preview: bool  # echo of the query param; False = preview_listing rule skipped
    funnel: list[FunnelStep]  # scanned -> market filters -> TVL -> preview_listing


class ProjectsResponse(BaseModel):
    count: int
    items: list[Project]
    meta: Meta

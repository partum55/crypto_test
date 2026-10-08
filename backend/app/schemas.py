from datetime import datetime
from enum import IntEnum

from pydantic import BaseModel


class Project(BaseModel):
    id: str
    symbol: str
    name: str
    image: str | None
    coingecko_url: str
    # Always set for list items (they passed the filters); may be null on the detail
    # endpoint, which serves any scanned coin.
    current_price: float | None
    market_cap: float | None
    fully_diluted_valuation: float | None
    total_volume: float | None
    total_supply: float | None
    max_supply: float | None
    total_value_locked: float | None
    preview_listing: bool | None  # null = details never checked (coin failed market filters)


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


class ChartDays(IntEnum):
    ONE = 1
    SEVEN = 7
    THIRTY = 30


class StoredDetails(BaseModel):
    preview_listing: bool
    tvl_usd: float | None
    checked_at: datetime


class Chart(BaseModel):
    days: int
    prices: list[tuple[int, float | None]]  # [ts_ms, usd]
    volumes: list[tuple[int, float | None]]  # [ts_ms, usd 24h volume]


class ProjectDetailMeta(BaseModel):
    fetched_at: datetime  # market snapshot the project/passes come from
    chart_cached: bool
    chart_error: str | None  # set when the chart couldn't be loaded (chart is then null)


class ProjectDetailResponse(BaseModel):
    project: Project
    details: StoredDetails | None  # null if this coin was never checked via /coins/{id}
    passes: dict[str, bool]  # market_cap, fdv, volume, supply, tvl, preview_listing
    chart: Chart | None
    meta: ProjectDetailMeta

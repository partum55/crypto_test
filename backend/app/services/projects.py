"""Runs the two-step filter pipeline and serves its result stale-while-revalidate.

Market data is fetched fresh on every refresh; per-coin details come from SQLite and are
only re-fetched from /coins/{id} when missing or older than DETAILS_TTL_SECONDS.
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.config import Settings
from app.schemas import (
    FunnelStep,
    Meta,
    Project,
    ProjectsResponse,
    RuleCheck,
    RuleKey,
    StoredDetails,
)
from app.services.coingecko import CoinGeckoClient, CoinGeckoError
from app.services.details_store import CoinDetails, DetailsStore, is_fresh
from app.services.filters import (
    extract_tvl_usd,
    fdv_below,
    has_market_cap,
    is_preview_listing,
    passes_detail_filters,
    passes_market_filters,
    supply_matches,
    tvl_above,
    volume_above,
)

log = logging.getLogger(__name__)


@dataclass
class Snapshot:
    tvl_passing: list[Project]  # passed the 5 non-preview criteria; preview applied per request
    after_details: int
    funnel: list[FunnelStep]
    scanned: int
    pages_fetched: int
    after_prefilter: int
    preview_listed: int
    details_fetched: int
    detail_errors: int
    fetched_at: datetime
    fetched_monotonic: float
    rows: dict[str, dict[str, Any]]  # every scanned market row by id (detail endpoint allow-list)
    details: dict[str, CoinDetails]  # stored details known at refresh time


@dataclass
class ProjectDetail:
    project: Project
    details: StoredDetails | None
    passes: list[RuleCheck]
    fetched_at: datetime


@dataclass
class Combined:
    tvl_passing: list[Project]  # candidates with stored details and TVL > TVL_MIN
    preview_listed: int  # candidates with stored details and preview_listing == true


class ProjectService:
    def __init__(self, client: CoinGeckoClient, store: DetailsStore, settings: Settings):
        self.client = client
        self.store = store
        self.s = settings
        self._snapshot: Snapshot | None = None
        self._task: asyncio.Task | None = None
        self._last_error: CoinGeckoError | None = None

    @property
    def refreshing(self) -> bool:
        return self._task is not None and not self._task.done()

    def start_refresh(self) -> None:
        # Check-and-create runs without an await in between, so concurrent requests
        # can never start two refreshes (single-flight without an explicit lock).
        if not self.refreshing:
            self._task = asyncio.create_task(self._refresh())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()

    def _is_stale(self) -> bool:
        snap = self._snapshot
        return snap is None or time.monotonic() - snap.fetched_monotonic >= self.s.cache_ttl_seconds

    def _current_snapshot(self) -> Snapshot:
        """The cached snapshot (triggering a background refresh if stale), or 503 if none yet."""
        if self._is_stale():
            self.start_refresh()
        snap = self._snapshot
        if snap is None:
            reason = f" Last attempt failed: {self._last_error.message}" if self._last_error else ""
            raise CoinGeckoError(503, f"Data is warming up, retry shortly.{reason}")
        return snap

    def get_detail(self, coin_id: str) -> ProjectDetail | None:
        """Project + per-criterion results for any coin in the last market scan.

        Only scanned ids are allowed, so the API can't be used to proxy arbitrary
        CoinGecko lookups. Returns None for an unknown id (the route answers 404).
        """
        snap = self._current_snapshot()
        row = snap.rows.get(coin_id)
        if row is None:
            return None
        details = snap.details.get(coin_id)
        return ProjectDetail(
            project=to_project(row, details),
            details=None
            if details is None
            else StoredDetails(
                preview_listing=details.preview_listing,
                tvl_usd=details.tvl_usd,
                checked_at=details.checked_at,
            ),
            passes=criteria_results(row, details, self.s),
            fetched_at=snap.fetched_at,
        )

    async def get_projects(self, require_preview: bool = True) -> ProjectsResponse:
        """Never blocks on CoinGecko: serves the cached snapshot and refreshes in the background.

        Both variants are filtered from the same cached snapshot, so require_preview costs
        no extra CoinGecko calls.
        """
        stale = self._is_stale()
        snap = self._current_snapshot()
        items = select(snap.tvl_passing, require_preview, self.s)
        return ProjectsResponse(
            count=len(items),
            items=items,
            meta=Meta(
                scanned=snap.scanned,
                pages_fetched=snap.pages_fetched,
                after_prefilter=snap.after_prefilter,
                preview_listed=snap.preview_listed,
                tvl_above_min=len(snap.tvl_passing),
                after_details=snap.after_details,
                details_fetched=snap.details_fetched,
                detail_errors=snap.detail_errors,
                fetched_at=snap.fetched_at,
                age_seconds=round(time.monotonic() - snap.fetched_monotonic, 1),
                stale=stale,
                refreshing=self.refreshing,
                last_error=self._last_error.message if self._last_error else None,
                require_preview=require_preview,
                funnel=snap.funnel,
            ),
        )

    async def _refresh(self) -> None:
        started = time.monotonic()
        try:
            self._snapshot = await self._build_snapshot()
            self._last_error = None
            log.info(
                "Refresh done in %.1fs: %d projects, %d detail calls",
                time.monotonic() - started,
                self._snapshot.after_details,
                self._snapshot.details_fetched,
            )
        except CoinGeckoError as exc:
            self._last_error = exc
            log.warning("Refresh failed: %s", exc.message)
        except Exception as exc:  # keep serving the old snapshot on any bug/upstream oddity
            self._last_error = CoinGeckoError(502, f"Unexpected error: {exc!r}")
            log.exception("Refresh failed")

    async def _build_snapshot(self) -> Snapshot:
        rows, pages = await self.client.fetch_market_rows()
        candidates = [row for row in rows if passes_market_filters(row, self.s)]

        stored = await asyncio.to_thread(self.store.load_all)
        now = datetime.now(UTC)
        to_fetch = [
            row["id"]
            for row in candidates
            if not is_fresh(stored.get(row["id"]), self.s.details_ttl_seconds, now)
        ]
        log.info(
            "Scanned %d coins on %d pages: %d candidates, %d need /coins/{id}",
            len(rows),
            pages,
            len(candidates),
            len(to_fetch),
        )

        errors = 0

        async def fetch_and_store(coin_id: str) -> None:
            nonlocal errors
            try:
                detail = await self.client.fetch_detail(coin_id)
            except CoinGeckoError as exc:
                if exc.status == 503:
                    raise  # rate limited even after retries: abort the whole refresh
                errors += 1  # e.g. 404 for a just-delisted coin; an older DB row may still be used
                log.warning("Skipping %s: %s", coin_id, exc.message)
                return
            details = parse_details(coin_id, detail, datetime.now(UTC))
            # Persist each coin as it arrives, so an aborted cold start keeps its progress.
            await asyncio.to_thread(self.store.upsert, [details])
            stored[coin_id] = details

        # TaskGroup cancels the remaining calls as soon as one raises.
        try:
            async with asyncio.TaskGroup() as tg:
                for coin_id in to_fetch:
                    tg.create_task(fetch_and_store(coin_id))
        except ExceptionGroup as group:
            raise group.exceptions[0] from None

        combined = combine(candidates, stored, self.s)
        strict_count = len(select(combined.tvl_passing, True, self.s))
        return Snapshot(
            tvl_passing=combined.tvl_passing,
            after_details=strict_count,
            funnel=build_funnel(
                self.s, len(rows), len(candidates), len(combined.tvl_passing), strict_count
            ),
            scanned=len(rows),
            pages_fetched=pages,
            after_prefilter=len(candidates),
            preview_listed=combined.preview_listed,
            details_fetched=len(to_fetch) - errors,
            detail_errors=errors,
            fetched_at=datetime.now(UTC),
            fetched_monotonic=time.monotonic(),
            rows={row["id"]: row for row in rows},
            details=stored,
        )


def parse_details(coin_id: str, detail: dict[str, Any], checked_at: datetime) -> CoinDetails:
    return CoinDetails(
        id=coin_id,
        preview_listing=is_preview_listing(detail),
        tvl_usd=extract_tvl_usd(detail),
        checked_at=checked_at,
    )


def combine(
    candidates: list[dict[str, Any]], details: dict[str, CoinDetails], s: Settings
) -> Combined:
    """Join fresh market rows with stored details and apply the TVL criterion.

    preview_listing is applied later by `select`, per request.
    """
    known = [(row, details[row["id"]]) for row in candidates if row["id"] in details]
    items = [to_project(row, d) for row, d in known if tvl_above(d.tvl_usd, s.tvl_min)]
    items.sort(key=lambda p: p.total_volume, reverse=True)
    return Combined(
        tvl_passing=items,
        preview_listed=sum(d.preview_listing for _, d in known),
    )


def select(tvl_passing: list[Project], require_preview: bool, s: Settings) -> list[Project]:
    """All six criteria by default; require_preview=False drops only preview_listing."""
    if not require_preview:
        return tvl_passing
    return [
        p for p in tvl_passing if passes_detail_filters(p.preview_listing, p.total_value_locked, s)
    ]


def usd_short(value: float) -> str:
    for divisor, suffix in ((1e9, "B"), (1e6, "M"), (1e3, "k")):
        if value >= divisor:
            return f"${value / divisor:g}{suffix}"
    return f"${value:g}"


MARKET_RULES: tuple[RuleKey, ...] = ("market_cap", "fdv", "volume", "supply")


def rule_labels(s: Settings) -> dict[RuleKey, str]:
    """The one place criterion labels are written; thresholds come from settings.

    Used by both the funnel and the detail `passes`, so the UI never hardcodes them.
    """
    return {
        "market_cap": "Market cap > 0",
        "fdv": f"FDV < {usd_short(s.fdv_max)}",
        "volume": f"24h volume > {usd_short(s.volume_min)}",
        "supply": "Max supply = total supply",
        "tvl": f"TVL > {usd_short(s.tvl_min)}",
        "preview_listing": "On CoinGecko's preview listing",
    }


def build_funnel(
    s: Settings, scanned: int, market: int, tvl: int, preview: int
) -> list[FunnelStep]:
    """Cumulative counts in pipeline order; labels follow the configured thresholds."""
    labels = rule_labels(s)
    return [
        FunnelStep(key="scanned", label="Scanned on CoinGecko markets", passed=scanned),
        FunnelStep(
            key="market_filters",
            label=", ".join(labels[k] for k in MARKET_RULES),
            passed=market,
        ),
        FunnelStep(key="tvl", label=labels["tvl"], passed=tvl),
        FunnelStep(key="preview_listing", label=labels["preview_listing"], passed=preview),
    ]


def criteria_results(
    row: dict[str, Any], details: CoinDetails | None, s: Settings
) -> list[RuleCheck]:
    """Pass/fail per criterion, in pipeline order. Unknown details (never checked) count as fail."""
    tvl = details.tvl_usd if details else None
    results: dict[RuleKey, bool] = {
        "market_cap": has_market_cap(row),
        "fdv": fdv_below(row, s.fdv_max),
        "volume": volume_above(row, s.volume_min),
        "supply": supply_matches(row, s.supply_rel_tol),
        "tvl": tvl_above(tvl, s.tvl_min),
        "preview_listing": bool(details and details.preview_listing),
    }
    labels = rule_labels(s)
    return [RuleCheck(key=k, label=labels[k], passed=ok) for k, ok in results.items()]


def to_project(row: dict[str, Any], details: CoinDetails | None) -> Project:
    return Project(
        id=row["id"],
        symbol=row["symbol"],
        name=row["name"],
        image=row.get("image"),
        coingecko_url=f"https://www.coingecko.com/en/coins/{row['id']}",
        current_price=row.get("current_price"),
        market_cap=row.get("market_cap"),
        fully_diluted_valuation=row.get("fully_diluted_valuation"),
        total_volume=row.get("total_volume"),
        total_supply=row.get("total_supply"),
        max_supply=row.get("max_supply"),
        total_value_locked=details.tvl_usd if details else None,
        preview_listing=details.preview_listing if details else None,
    )

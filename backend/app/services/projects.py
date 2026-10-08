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
from app.schemas import Meta, Project, ProjectsResponse
from app.services.coingecko import CoinGeckoClient, CoinGeckoError
from app.services.details_store import CoinDetails, DetailsStore, is_fresh
from app.services.filters import (
    extract_tvl_usd,
    is_preview_listing,
    passes_detail_filters,
    passes_market_filters,
    tvl_above,
)

log = logging.getLogger(__name__)


@dataclass
class Snapshot:
    items: list[Project]
    scanned: int
    pages_fetched: int
    after_prefilter: int
    preview_listed: int
    tvl_above_min: int
    details_fetched: int
    detail_errors: int
    fetched_at: datetime
    fetched_monotonic: float


@dataclass
class Combined:
    items: list[Project]
    preview_listed: int
    tvl_above_min: int


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

    async def get_projects(self) -> ProjectsResponse:
        """Never blocks on CoinGecko: serves the cached snapshot and refreshes in the background."""
        stale = self._is_stale()
        if stale:
            self.start_refresh()
        snap = self._snapshot
        if snap is None:
            reason = f" Last attempt failed: {self._last_error.message}" if self._last_error else ""
            raise CoinGeckoError(503, f"Data is warming up, retry shortly.{reason}")
        return ProjectsResponse(
            count=len(snap.items),
            items=snap.items,
            meta=Meta(
                scanned=snap.scanned,
                pages_fetched=snap.pages_fetched,
                after_prefilter=snap.after_prefilter,
                preview_listed=snap.preview_listed,
                tvl_above_min=snap.tvl_above_min,
                after_details=len(snap.items),
                details_fetched=snap.details_fetched,
                detail_errors=snap.detail_errors,
                fetched_at=snap.fetched_at,
                age_seconds=round(time.monotonic() - snap.fetched_monotonic, 1),
                stale=stale,
                refreshing=self.refreshing,
                last_error=self._last_error.message if self._last_error else None,
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
                len(self._snapshot.items),
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
        return Snapshot(
            items=combined.items,
            scanned=len(rows),
            pages_fetched=pages,
            after_prefilter=len(candidates),
            preview_listed=combined.preview_listed,
            tvl_above_min=combined.tvl_above_min,
            details_fetched=len(to_fetch) - errors,
            detail_errors=errors,
            fetched_at=datetime.now(UTC),
            fetched_monotonic=time.monotonic(),
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
    """Join fresh market rows with stored details and apply the detail criteria."""
    known = [(row, details[row["id"]]) for row in candidates if row["id"] in details]
    items = [
        to_project(row, d)
        for row, d in known
        if passes_detail_filters(d.preview_listing, d.tvl_usd, s)
    ]
    items.sort(key=lambda p: p.total_volume, reverse=True)
    return Combined(
        items=items,
        preview_listed=sum(d.preview_listing for _, d in known),
        tvl_above_min=sum(tvl_above(d.tvl_usd, s.tvl_min) for _, d in known),
    )


def to_project(row: dict[str, Any], details: CoinDetails) -> Project:
    return Project(
        id=row["id"],
        symbol=row["symbol"],
        name=row["name"],
        image=row.get("image"),
        coingecko_url=f"https://www.coingecko.com/en/coins/{row['id']}",
        current_price=row.get("current_price"),
        market_cap=row["market_cap"],
        fully_diluted_valuation=row["fully_diluted_valuation"],
        total_volume=row["total_volume"],
        total_supply=row["total_supply"],
        max_supply=row["max_supply"],
        total_value_locked=details.tvl_usd,
        preview_listing=details.preview_listing,
    )

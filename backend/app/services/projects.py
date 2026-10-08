"""Runs the two-step filter pipeline and serves its result stale-while-revalidate."""

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.config import Settings
from app.schemas import Meta, Project, ProjectsResponse
from app.services.coingecko import CoinGeckoClient, CoinGeckoError
from app.services.filters import extract_tvl_usd, passes_detail_filters, passes_market_filters

log = logging.getLogger(__name__)


@dataclass
class Snapshot:
    items: list[Project]
    scanned: int
    pages_fetched: int
    after_prefilter: int
    detail_errors: int
    fetched_at: datetime
    fetched_monotonic: float


class ProjectService:
    def __init__(self, client: CoinGeckoClient, settings: Settings):
        self.client = client
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
                after_details=len(snap.items),
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
                "Refresh done in %.1fs: %d projects",
                time.monotonic() - started,
                len(self._snapshot.items),
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
        log.info("Scanned %d coins on %d pages, %d candidates", len(rows), pages, len(candidates))

        errors = 0

        async def detail_or_none(coin_id: str) -> dict[str, Any] | None:
            nonlocal errors
            try:
                return await self.client.fetch_detail(coin_id)
            except CoinGeckoError as exc:
                if exc.status == 503:
                    raise  # rate limited even after retries: abort the whole refresh
                errors += 1
                log.warning("Skipping %s: %s", coin_id, exc.message)
                return None

        # TaskGroup cancels the remaining calls as soon as one raises.
        try:
            async with asyncio.TaskGroup() as tg:
                tasks = [tg.create_task(detail_or_none(row["id"])) for row in candidates]
        except ExceptionGroup as group:
            raise group.exceptions[0] from None

        items = [
            to_project(row, detail)
            for row, task in zip(candidates, tasks, strict=True)
            if (detail := task.result()) is not None and passes_detail_filters(detail, self.s)
        ]
        items.sort(key=lambda p: p.total_volume, reverse=True)
        return Snapshot(
            items=items,
            scanned=len(rows),
            pages_fetched=pages,
            after_prefilter=len(candidates),
            detail_errors=errors,
            fetched_at=datetime.now(UTC),
            fetched_monotonic=time.monotonic(),
        )


def to_project(row: dict[str, Any], detail: dict[str, Any]) -> Project:
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
        total_value_locked=extract_tvl_usd(detail),
        preview_listing=True,
    )
